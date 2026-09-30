import neo4j, { type Driver, type QueryResult, type RecordShape } from 'neo4j-driver'
import type {
  CandidateRouteEvidence, CandidateRouteRecord, CandidateRouteStatus,
  DecisionContext, RetrievedMemory, RouteExceptionRecord, RouteExceptionStatus, StructuredDemand, WorkspaceIssueInput, WorkspaceIssueRecord, WorkspaceIssueStatus,
} from '../src/api-contracts.js'
import type { GraphCapacityUnit, GraphNeighbourhood, GraphOutcomeWrite, GraphPlace, GraphRepository, PlaceResolution } from './graph-types.js'
import { DEFAULT_CAPACITY_UNITS, DEFAULT_PLACES } from './default-graph.js'

const workspaceIssueThreshold = () => Math.max(2, Number(process.env.CREMORNE_ROOM_ISSUE_THRESHOLD || 3))
const routeExceptionThreshold = () => Math.max(2, Number(process.env.CREMORNE_ROUTE_EXCEPTION_THRESHOLD || 3))

function routeExceptionId(capacityUnitId: string, requirement: string) {
  return `route-exception-${normalise(capacityUnitId).replace(/ /g, '-')}-${normalise(requirement).replace(/ /g, '-')}`
}

function workspaceIssueRequirement(issue: WorkspaceIssueInput) {
  if (issue.issue === 'temperature') return 'thermal-comfort'
  if (issue.issue === 'blinds') return 'adjustable-blinds'
  if (issue.issue === 'acoustics') return 'hybrid'
  if (issue.issue === 'accessibility') return 'mobility'
  if (issue.issue === 'equipment') return issue.facility ? `equipment:${normalise(issue.facility).replace(/ /g, '-')}` : 'equipment'
  return 'standard'
}

function workspaceIssueSummary(issue: WorkspaceIssueInput) {
  const subject = issue.issue === 'temperature' ? 'temperature or air-conditioning'
    : issue.issue === 'equipment' ? `${issue.facility || 'room equipment'}`
      : issue.issue === 'blinds' ? 'sun-control blinds'
        : issue.issue === 'acoustics' ? 'room acoustics'
          : issue.issue === 'accessibility' ? 'accessibility'
            : 'room experience'
  return `A previous visit reported an issue with ${subject}${issue.detail ? `: ${issue.detail}` : '.'}`
}

function workspaceIssueId(capacityUnitId: string, issue: WorkspaceIssueInput) {
  const discriminator = issue.facility ? `-${normalise(issue.facility).replace(/ /g, '-')}` : ''
  return `workspace-issue-${normalise(capacityUnitId).replace(/ /g, '-')}-${issue.issue}${discriminator}`
}

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

function similarity(left: string, right: string) {
  const a = new Set(normalise(left).split(' ').filter(Boolean))
  const b = new Set(normalise(right).split(' ').filter(Boolean))
  const intersection = [...a].filter((token) => b.has(token)).length
  const union = new Set([...a, ...b]).size
  return union ? intersection / union : 0
}

function resolveAgainstPlaces(raw: string, places: GraphPlace[]): PlaceResolution {
  const query = normalise(raw)
  if (!query) return { place: null, clarification: 'Please add a destination.', confidence: 0 }

  const exact = places.find((place) => [place.name, ...place.aliases].some((alias) => normalise(alias) === query))
  if (exact) return { place: exact, clarification: null, confidence: 1 }

  const ranked = places.map((place) => ({
    place,
    score: Math.max(...[place.name, ...place.aliases].map((alias) => similarity(raw, alias))),
  })).sort((a, b) => b.score - a.score)
  const first = ranked[0]
  const second = ranked[1]
  if (!first || first.score < 0.66 || (second && first.score - second.score < 0.12)) {
    return {
      place: null,
      clarification: `We could not confidently match “${raw}”. Try Richmond Station, East Richmond Station or Cremorne Digital Hub.`,
      confidence: first?.score ?? 0,
    }
  }
  return { place: first.place, clarification: null, confidence: first.score }
}

function relevantRequirementKeys(demand: StructuredDemand) {
  const keys: string[] = []
  if (demand.requirements.lowUv || demand.preferences.uv === 'lower') keys.push('low-uv', 'low-glare')
  if (demand.requirements.stepFree || demand.requirements.accessible) keys.push('mobility')
  if (demand.requirements.hybridEquipment) keys.push('hybrid')
  demand.requirements.equipment.forEach((equipment) => {
    const key = normalise(equipment).replace(/ /g, '-')
    keys.push(`equipment:${key}`)
    if (key.includes('blind')) keys.push('adjustable-blinds')
  })
  if (demand.intent === 'workspace') keys.push('thermal-comfort', 'acoustics', 'equipment')
  return keys.length ? keys : ['standard']
}

function primaryRequirement(demand: StructuredDemand) {
  return demand.requirements.lowUv ? 'low-uv'
    : demand.requirements.stepFree || demand.requirements.accessible ? 'mobility'
      : demand.intent === 'workspace' && demand.preferences.uv === 'lower' ? 'low-glare'
        : 'standard'
}

function candidateCapacity(source: GraphCapacityUnit, candidate: CandidateRouteRecord, evidence: CandidateRouteEvidence = {}): GraphCapacityUnit {
  return {
    ...source,
    id: candidate.id,
    productId: candidate.id,
    name: candidate.name,
    routeCode: undefined,
    durationMinutes: evidence.durationMinutes ?? source.durationMinutes,
    distanceMetres: evidence.distanceMetres ?? source.distanceMetres,
    shadePercent: evidence.shadePercent ?? source.shadePercent,
    directUvFactor: evidence.directUvFactor ?? source.directUvFactor,
    stepFree: evidence.stepFree ?? source.stepFree,
    safeCapacity: evidence.safeCapacity ?? source.safeCapacity,
    baselineDemandShare: evidence.baselineDemandShare ?? 0.05,
    acceptedRecommendations: 0,
    facilities: [...new Set([...source.facilities, 'Worker-discovered path'])],
  }
}

export class InMemoryCapacityGraph implements GraphRepository {
  readonly backend = 'in-memory' as const
  private readonly places = structuredClone(DEFAULT_PLACES)
  private capacities: GraphCapacityUnit[] = structuredClone(DEFAULT_CAPACITY_UNITS)
  private memories: Array<RetrievedMemory & { profileId?: string; uvMin?: number; crowdingMin?: number }> = []
  private outcomes: GraphOutcomeWrite[] = []
  private candidateRoutes: CandidateRouteRecord[] = []
  private workspaceIssueReviews = new Map<string, { status: 'validated' | 'rejected'; reviewedAt: string; reason: string }>()
  private routeExceptionReviews = new Map<string, { status: 'validated' | 'rejected'; reviewedAt: string; reason: string }>()

  async ensureSeeded() {}

  async resolvePlace(raw: string) {
    return resolveAgainstPlaces(raw, this.places)
  }

  async retrieve(demand: StructuredDemand, context: DecisionContext, useMemory: boolean): Promise<GraphNeighbourhood> {
    const candidates = this.capacities.filter((unit) => {
      if (unit.kind !== demand.intent) return false
      if (demand.intent === 'movement') return unit.destinationId === demand.destinationId
      return unit.accessClass === 'shared' || Boolean(demand.requesterOrganisation && unit.ownerOrganisation === demand.requesterOrganisation)
    })
    const requirements = relevantRequirementKeys(demand)
    const memories = useMemory ? this.memories.filter((memory) => {
      if (!candidates.some((candidate) => candidate.id === memory.capacityUnitId)) return false
      if (!requirements.includes(memory.requirement)) return false
      if (memory.source === 'operating-rule' && context.uvIndex < (memory.uvMin ?? 7)) return false
      if (memory.source === 'operating-rule' && context.crowding < (memory.crowdingMin ?? 0)) return false
      if (memory.scope === 'personal' && (!context.profileId || memory.profileId !== context.profileId)) return false
      return true
    }) : []
    return { backend: this.backend, candidates: structuredClone(candidates), memories: structuredClone(memories) }
  }

  async recordOutcome(input: GraphOutcomeWrite) {
    this.outcomes = [structuredClone(input), ...this.outcomes.filter((outcome) => outcome.id !== input.id)]
    const memoryIds: string[] = []
    if (input.feedback) {
      const requirement = primaryRequirement(input.demand)
      const id = input.id
      this.memories = [{
        id,
        capacityUnitId: input.capacityUnitId,
        requirement,
        summary: `A comparable user rated this option ${input.feedback}.`,
        effect: input.feedback === 'worse' ? 25 : input.feedback === 'better' ? -8 : 0,
        confidence: 0.55,
        applies: true,
        source: 'outcome',
        scope: 'personal',
        profileId: input.context.profileId,
      }, ...this.memories.filter((memory) => memory.id !== id)]
      memoryIds.push(id)
    }
    if (input.demand.intent === 'workspace' && input.workspaceIssues?.length) {
      input.workspaceIssues.forEach((issue, index) => {
        const id = `${input.id}-workspace-issue-${index}`
        this.memories = [{
          id,
          capacityUnitId: input.capacityUnitId,
          requirement: workspaceIssueRequirement(issue),
          summary: workspaceIssueSummary(issue),
          effect: (issue.severity ?? 2) * 8,
          confidence: 0.6,
          applies: true,
          source: 'outcome',
          scope: 'personal',
          profileId: input.context.profileId,
        }, ...this.memories.filter((memory) => memory.id !== id)]
        memoryIds.push(id)
      })
    }
    if (input.candidateRule) {
      const matchingUnits = this.capacities.filter((capacity) => capacity.routeCode === input.candidateRule?.routeId)
      matchingUnits.forEach((capacity) => {
        this.memories = [{
          id: input.candidateRule!.id,
          capacityUnitId: capacity.id,
          requirement: input.candidateRule!.exception.functionalNeed,
          summary: `A comparable ${input.candidateRule!.context.place} test increased ${input.candidateRule!.exception.metric}.`,
          effect: input.candidateRule!.exception.delta,
          confidence: input.candidateRule!.confidence,
          applies: true,
          source: 'operating-rule',
          scope: 'precinct',
          uvMin: input.candidateRule!.context.uvMin,
          crowdingMin: input.candidateRule!.context.crowdingMin,
        }, ...this.memories.filter((memory) => !(memory.id === input.candidateRule!.id && memory.capacityUnitId === capacity.id))]
      })
      memoryIds.push(input.candidateRule.id)
    }
    let candidateCapacityId: string | undefined
    if (input.shareTrace && (input.feedback === 'better' || !input.feedback) && input.demand.intent === 'movement' && (input.journeyTrace?.length ?? 0) >= 3) {
      candidateCapacityId = `candidate-route-${input.id}`
      const source = this.capacities.find((capacity) => capacity.id === input.capacityUnitId)
      if (!source) throw new Error(`Source capacity ${input.capacityUnitId} was not found.`)
      if (!this.candidateRoutes.some((candidate) => candidate.id === candidateCapacityId)) {
        this.candidateRoutes.unshift({
          id: candidateCapacityId,
          name: input.candidateRouteName || 'Worker-discovered path',
          sourceCapacityUnitId: input.capacityUnitId,
          placeId: source.placeId,
          destinationId: source.destinationId ?? null,
          status: 'candidate',
          geometry: structuredClone(input.journeyTrace!),
          createdAt: new Date().toISOString(),
          feedback: input.feedback === 'better' ? 'better' : 'proposed',
          sampleCount: input.journeyTrace!.length,
          evidenceCount: 1,
          requirement: primaryRequirement(input.demand),
          metrics: structuredClone(input.metrics),
        })
      }
    }
    return { outcomeId: input.id, memoryIds: [...new Set(memoryIds)], candidateCapacityId }
  }

  async listCandidateRoutes(status?: CandidateRouteStatus) {
    return structuredClone(this.candidateRoutes.filter((candidate) => !status || candidate.status === status))
  }

  async reviewCandidateRoute(input: {
    candidateCapacityId: string
    decision: 'validate' | 'reject'
    reason: string
    evidence?: CandidateRouteEvidence
  }) {
    const candidate = this.candidateRoutes.find((item) => item.id === input.candidateCapacityId)
    if (!candidate) throw new Error(`Candidate route ${input.candidateCapacityId} was not found.`)
    if (candidate.status === 'validated' || candidate.status === 'rejected') {
      throw new Error(`Candidate route ${candidate.id} has already been ${candidate.status}.`)
    }
    candidate.status = input.decision === 'validate' ? 'validated' : 'rejected'
    candidate.reviewedAt = new Date().toISOString()
    candidate.reviewReason = input.reason
    candidate.validationConfidence = input.evidence?.confidence
    candidate.evidenceCount += 1

    if (candidate.status === 'validated') {
      const source = this.capacities.find((capacity) => capacity.id === candidate.sourceCapacityUnitId)
      if (!source) throw new Error(`Source capacity ${candidate.sourceCapacityUnitId} was not found.`)
      this.capacities = [...this.capacities.filter((capacity) => capacity.id !== candidate.id), candidateCapacity(source, candidate, input.evidence)]
      this.memories = [{
        id: `validation-${candidate.id}`,
        capacityUnitId: candidate.id,
        requirement: candidate.requirement,
        summary: `CDH validated this worker-discovered route: ${input.reason}`,
        effect: -6,
        confidence: input.evidence?.confidence ?? 0.7,
        applies: true,
        source: 'outcome',
        scope: 'cohort',
      }, ...this.memories]
    }
    return structuredClone(candidate)
  }

  async listWorkspaceIssues(status?: WorkspaceIssueStatus) {
    const grouped = new Map<string, {
      capacityUnitId: string
      issue: WorkspaceIssueInput
      reports: GraphOutcomeWrite[]
      details: string[]
    }>()
    this.outcomes.filter((outcome) => outcome.demand.intent === 'workspace').forEach((outcome) => {
      outcome.workspaceIssues?.forEach((issue) => {
        const id = workspaceIssueId(outcome.capacityUnitId, issue)
        const group = grouped.get(id) ?? { capacityUnitId: outcome.capacityUnitId, issue, reports: [], details: [] }
        group.reports.push(outcome)
        if (issue.detail && !group.details.includes(issue.detail)) group.details.push(issue.detail)
        grouped.set(id, group)
      })
    })
    const records = [...grouped.entries()].map(([id, group]) => {
      const review = this.workspaceIssueReviews.get(id)
      const reporterIds = new Set(group.reports.map((report) => report.context.profileId || `anonymous-${report.id}`))
      const timestamps = group.reports.map((report) => report.context.requestedAt).sort()
      const capacity = this.capacities.find((unit) => unit.id === group.capacityUnitId)
      return {
        id,
        capacityUnitId: group.capacityUnitId,
        capacityName: capacity?.name || group.capacityUnitId,
        issue: group.issue.issue,
        requirement: workspaceIssueRequirement(group.issue),
        status: review?.status ?? (reporterIds.size >= workspaceIssueThreshold() ? 'candidate' : 'collecting'),
        reportCount: group.reports.length,
        independentReporterCount: reporterIds.size,
        firstReportedAt: timestamps[0] || '',
        lastReportedAt: timestamps.at(-1) || '',
        reviewedAt: review?.reviewedAt,
        reviewReason: review?.reason,
        sampleDetails: group.details.slice(0, 3),
      } satisfies WorkspaceIssueRecord
    }).filter((record) => !status || record.status === status)
    return structuredClone(records.sort((a, b) => b.independentReporterCount - a.independentReporterCount))
  }

  async reviewWorkspaceIssue(input: { issueId: string; decision: 'validate' | 'reject'; reason: string }) {
    const issue = (await this.listWorkspaceIssues()).find((record) => record.id === input.issueId)
    if (!issue) throw new Error(`Workspace issue ${input.issueId} was not found.`)
    if (issue.status !== 'candidate') throw new Error('A workspace issue must reach the independent-report threshold before review.')
    const status = input.decision === 'validate' ? 'validated' : 'rejected'
    const reviewedAt = new Date().toISOString()
    this.workspaceIssueReviews.set(issue.id, { status, reviewedAt, reason: input.reason })
    if (status === 'validated') {
      this.memories = [{
        id: `validated-${issue.id}`,
        capacityUnitId: issue.capacityUnitId,
        requirement: issue.requirement,
        summary: `${issue.independentReporterCount} independent reports confirmed: ${input.reason}`,
        effect: 24,
        confidence: Math.min(0.9, 0.55 + issue.independentReporterCount * 0.05),
        applies: true,
        source: 'outcome',
        scope: 'cohort',
      }, ...this.memories]
    }
    return (await this.listWorkspaceIssues(status))[0]
  }

  async listRouteExceptions(status?: RouteExceptionStatus) {
    const grouped = new Map<string, { capacityUnitId: string; requirement: string; reports: GraphOutcomeWrite[] }>()
    this.outcomes
      .filter((outcome) => outcome.demand.intent === 'movement' && outcome.feedback === 'worse' && outcome.context.uvIndex >= 3)
      .forEach((outcome) => {
        const requirement = primaryRequirement(outcome.demand)
        if (requirement !== 'low-uv') return
        const id = routeExceptionId(outcome.capacityUnitId, requirement)
        const group = grouped.get(id) ?? { capacityUnitId: outcome.capacityUnitId, requirement, reports: [] }
        group.reports.push(outcome)
        grouped.set(id, group)
      })
    const records = [...grouped.entries()].map(([id, group]) => {
      const review = this.routeExceptionReviews.get(id)
      const reporterIds = new Set(group.reports.map((report) => report.context.profileId || `anonymous-${report.id}`))
      const timestamps = group.reports.map((report) => report.context.requestedAt).sort()
      const capacity = this.capacities.find((unit) => unit.id === group.capacityUnitId)
      return {
        id,
        capacityUnitId: group.capacityUnitId,
        capacityName: capacity?.name || group.capacityUnitId,
        requirement: group.requirement,
        status: review?.status ?? (reporterIds.size >= routeExceptionThreshold() ? 'candidate' : 'collecting'),
        reportCount: group.reports.length,
        independentReporterCount: reporterIds.size,
        uvMin: Math.min(...group.reports.map((report) => report.context.uvIndex)),
        crowdingMin: Math.min(...group.reports.map((report) => report.context.crowding)),
        firstReportedAt: timestamps[0] || '',
        lastReportedAt: timestamps.at(-1) || '',
        reviewedAt: review?.reviewedAt,
        reviewReason: review?.reason,
      } satisfies RouteExceptionRecord
    }).filter((record) => !status || record.status === status)
    return structuredClone(records.sort((a, b) => b.independentReporterCount - a.independentReporterCount))
  }

  async reviewRouteException(input: { exceptionId: string; decision: 'validate' | 'reject'; reason: string }) {
    const exception = (await this.listRouteExceptions()).find((record) => record.id === input.exceptionId)
    if (!exception) throw new Error(`Route exception ${input.exceptionId} was not found.`)
    if (exception.status !== 'candidate') throw new Error('A route exception must reach the independent-report threshold before review.')
    const status = input.decision === 'validate' ? 'validated' : 'rejected'
    const reviewedAt = new Date().toISOString()
    this.routeExceptionReviews.set(exception.id, { status, reviewedAt, reason: input.reason })
    if (status === 'validated') {
      this.memories = [{
        id: `validated-${exception.id}`,
        capacityUnitId: exception.capacityUnitId,
        requirement: exception.requirement,
        summary: `${exception.independentReporterCount} similar journeys found this route unsuitable under comparable UV.`,
        effect: 50,
        confidence: Math.min(0.9, 0.55 + exception.independentReporterCount * 0.05),
        applies: true,
        source: 'operating-rule',
        scope: 'precinct',
        uvMin: exception.uvMin,
        crowdingMin: exception.crowdingMin,
      }, ...this.memories]
    }
    const reviewed = (await this.listRouteExceptions(status)).find((record) => record.id === input.exceptionId)
    if (!reviewed) throw new Error(`Route exception ${input.exceptionId} could not be reloaded after review.`)
    return reviewed
  }
}

let cachedDriver: Driver | null = null
let seedPromise: Promise<void> | null = null
const BASE_DATASET_ID = 'cremorne-public-baseline'
const BASE_DATASET_VERSION = '2026-10-01-real-capacity-v3'

function neo4jConfigured() {
  return Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD)
}

function getDriver() {
  if (cachedDriver) return cachedDriver
  if (!neo4jConfigured()) throw new Error('Neo4j is not configured')
  cachedDriver = neo4j.driver(
    process.env.NEO4J_URI!,
    neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!),
  )
  return cachedDriver
}

function database() {
  return process.env.NEO4J_DATABASE || 'neo4j'
}

function properties(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && 'properties' in value) {
    return (value as { properties: Record<string, unknown> }).properties
  }
  return {}
}

function toNumber(value: unknown, fallback = 0) {
  if (neo4j.isInt(value)) return value.toNumber()
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String) : []
}

export class Neo4jCapacityGraph implements GraphRepository {
  readonly backend = 'neo4j' as const
  private readonly driver = getDriver()

  async ensureSeeded() {
    // Production requests must never pay for schema/data migration work. The
    // deployment seed command owns that lifecycle; local development may opt in.
    if (process.env.VERCEL || process.env.CREMORNE_AUTO_SEED === 'false') return
    if (!seedPromise) seedPromise = this.seedIfEmpty()
    return seedPromise
  }

  private async run(query: string, parameters: Record<string, unknown> = {}): Promise<QueryResult<RecordShape>> {
    return this.driver.executeQuery(query, parameters, { database: database() })
  }

  private async seedIfEmpty() {
    const result = await this.run(`
      OPTIONAL MATCH (dataset:CremorneDataset {id: $datasetId})
      RETURN dataset.version AS version
    `, { datasetId: BASE_DATASET_ID })
    const record = result.records[0]
    if (record && String(record.get('version') ?? '') === BASE_DATASET_VERSION) return
    await this.seed()
  }

  private async seed() {
    const constraints = [
      'CREATE CONSTRAINT place_id IF NOT EXISTS FOR (n:Place) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT capacity_id IF NOT EXISTS FOR (n:CapacityUnit) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT rule_id IF NOT EXISTS FOR (n:OperatingRule) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT outcome_id IF NOT EXISTS FOR (n:Outcome) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT requirement_key IF NOT EXISTS FOR (n:Requirement) REQUIRE n.key IS UNIQUE',
      'CREATE CONSTRAINT issue_report_id IF NOT EXISTS FOR (n:IssueReport) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT workspace_issue_id IF NOT EXISTS FOR (n:WorkspaceIssue) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT route_exception_id IF NOT EXISTS FOR (n:RouteException) REQUIRE n.id IS UNIQUE',
    ]
    for (const query of constraints) await this.run(query)

    await this.run(`
      UNWIND $places AS row
      MERGE (p:Place {id: row.id})
      SET p.name = row.name, p.aliases = row.aliases
    `, { places: DEFAULT_PLACES })

    await this.run(`
      UNWIND $units AS row
      MERGE (c:CapacityUnit {id: row.id})
      SET c.productId = row.productId,
          c.kind = row.kind,
          c.name = row.name,
          c.destinationId = row.destinationId,
          c.routeCode = row.routeCode,
          c.durationMinutes = row.durationMinutes,
          c.distanceMetres = row.distanceMetres,
          c.shadePercent = row.shadePercent,
          c.directUvFactor = row.directUvFactor,
          c.stepFree = row.stepFree,
          c.safeCapacity = row.safeCapacity,
          c.capacityEvidence = row.capacityEvidence,
          c.baselineDemandShare = row.baselineDemandShare,
          c.acceptedRecommendations = row.acceptedRecommendations,
          c.facilities = row.facilities,
          c.accessClass = row.accessClass,
          c.ownerOrganisation = row.ownerOrganisation,
          c.availability = row.availability
      WITH c, row
      MATCH (p:Place {id: row.placeId})
      MERGE (c)-[:LOCATED_AT]->(p)
    `, { units: DEFAULT_CAPACITY_UNITS })

    await this.run(`
      UNWIND $requirements AS row
      MERGE (r:Requirement {key: row.key})
      SET r.name = row.name
    `, { requirements: [
      { key: 'low-uv', name: 'Low UV exposure' },
      { key: 'low-glare', name: 'Low glare' },
      { key: 'mobility', name: 'Step-free mobility' },
      { key: 'hybrid', name: 'Hybrid meeting equipment' },
      { key: 'thermal-comfort', name: 'Thermal comfort' },
      { key: 'adjustable-blinds', name: 'Adjustable blinds' },
      { key: 'acoustics', name: 'Room acoustics' },
      { key: 'equipment', name: 'Room equipment' },
      { key: 'standard', name: 'Standard journey' },
    ] })

    await this.run(`
      OPTIONAL MATCH (evidence:Evidence {id: 'synthetic-route-b-seed-42'})
      DETACH DELETE evidence
    `)
    await this.run(`
      OPTIONAL MATCH (rule:OperatingRule {id: 'church-st-high-uv-route-b'})
      OPTIONAL MATCH (rule)-[:HAS_EXCEPTION]->(exception:Exception {id: 'route-b-low-uv'})
      DETACH DELETE rule, exception
    `)
    await this.run(`
      OPTIONAL MATCH (outcome:Outcome {id: 'boardroom-low-glare-outcome'})
      DETACH DELETE outcome
    `)
    await this.run(`
      MERGE (dataset:CremorneDataset {id: $datasetId})
      SET dataset.version = $version,
          dataset.updatedAt = datetime()
    `, { datasetId: BASE_DATASET_ID, version: BASE_DATASET_VERSION })
  }

  async resolvePlace(raw: string) {
    await this.ensureSeeded()
    // Place aliases ship with the same versioned baseline that seeds Neo4j.
    // Resolving them locally removes one database round-trip from every request.
    return resolveAgainstPlaces(raw, DEFAULT_PLACES)
  }

  async retrieve(demand: StructuredDemand, context: DecisionContext, useMemory: boolean): Promise<GraphNeighbourhood> {
    await this.ensureSeeded()
    const candidateResult = await this.run(`
      MATCH (capacity:CapacityUnit)-[:LOCATED_AT]->(place:Place)
      WHERE capacity.kind = $kind
        AND coalesce(capacity.status, 'validated') = 'validated'
        AND ($kind <> 'movement' OR capacity.destinationId = $destinationId)
        AND ($kind <> 'workspace' OR capacity.accessClass = 'shared' OR capacity.ownerOrganisation = $requesterOrganisation)
      RETURN capacity, place
      ORDER BY capacity.name
    `, {
      kind: demand.intent,
      destinationId: demand.destinationId,
      requesterOrganisation: demand.requesterOrganisation || '',
    })
    const candidates = candidateResult.records.map((record) => {
      const data = properties(record.get('capacity'))
      const place = properties(record.get('place'))
      return {
        id: String(data.id), productId: String(data.productId), kind: String(data.kind) as 'movement' | 'workspace',
        name: String(data.name), placeId: String(place.id), destinationId: data.destinationId ? String(data.destinationId) : undefined,
        routeCode: data.routeCode ? String(data.routeCode) as 'A' | 'B' | 'C' : undefined,
        durationMinutes: data.durationMinutes == null ? undefined : toNumber(data.durationMinutes),
        distanceMetres: data.distanceMetres == null ? undefined : toNumber(data.distanceMetres),
        shadePercent: data.shadePercent == null ? undefined : toNumber(data.shadePercent),
        directUvFactor: data.directUvFactor == null ? undefined : toNumber(data.directUvFactor),
        stepFree: data.stepFree == null ? undefined : Boolean(data.stepFree),
        safeCapacity: toNumber(data.safeCapacity), capacityEvidence: data.capacityEvidence ? String(data.capacityEvidence) as 'verified' | 'unknown' : undefined,
        baselineDemandShare: data.baselineDemandShare == null ? undefined : toNumber(data.baselineDemandShare),
        acceptedRecommendations: toNumber(data.acceptedRecommendations), facilities: stringArray(data.facilities),
        accessClass: data.accessClass ? String(data.accessClass) as 'shared' | 'internal' : undefined,
        ownerOrganisation: data.ownerOrganisation ? String(data.ownerOrganisation) : undefined,
        availability: stringArray(data.availability),
      } satisfies GraphCapacityUnit
    })

    if (!useMemory || candidates.length === 0) return { backend: this.backend, candidates, memories: [] }
    const ids = candidates.map((candidate) => candidate.id)
    const requirements = relevantRequirementKeys(demand)
    const ruleQuery = this.run(`
      MATCH (rule:OperatingRule)-[:APPLIES_TO]->(capacity:CapacityUnit)
      MATCH (rule)-[:UNDER_CONTEXT]->(context:Context)
      MATCH (rule)-[:HAS_EXCEPTION]->(exception:Exception)-[:AFFECTS]->(requirement:Requirement)
      WHERE capacity.id IN $ids AND requirement.key IN $requirements
        AND coalesce(context.uvMin, 0.0) <= $uvIndex
        AND coalesce(context.crowdingMin, 0.0) <= $crowding
      RETURN rule, capacity.id AS capacityId, requirement.key AS requirementKey, exception.summary AS exceptionSummary
    `, { ids, requirements, uvIndex: context.uvIndex, crowding: context.crowding })
    const outcomeQuery = this.run(`
      MATCH (capacity:CapacityUnit)-[:HAS_OUTCOME]->(outcome:Outcome)-[:FOR_REQUIREMENT]->(requirement:Requirement)
      WHERE capacity.id IN $ids AND requirement.key IN $requirements
        AND (outcome.scope IN ['cohort', 'precinct']
          OR (outcome.scope = 'personal' AND $profileId <> '' AND outcome.profileId = $profileId))
      RETURN capacity.id AS capacityId, outcome, requirement.key AS requirementKey
      ORDER BY outcome.createdAt DESC
      LIMIT 20
    `, { ids, requirements, profileId: context.profileId || '' })
    const personalIssueQuery = context.profileId ? this.run(`
      MATCH (capacity:CapacityUnit)-[:HAS_ISSUE_REPORT]->(report:IssueReport)-[:FOR_REQUIREMENT]->(requirement:Requirement)
      WHERE capacity.id IN $ids
        AND requirement.key IN $requirements
        AND report.profileId = $profileId
      RETURN capacity.id AS capacityId, report, requirement.key AS requirementKey
      ORDER BY report.createdAt DESC
      LIMIT 20
    `, { ids, requirements, profileId: context.profileId }) : Promise.resolve(null)

    const [ruleResult, outcomeResult, personalIssueResult] = await Promise.all([ruleQuery, outcomeQuery, personalIssueQuery])

    const memories: RetrievedMemory[] = [
      ...ruleResult.records.map((record) => {
        const rule = properties(record.get('rule'))
        return {
          id: String(rule.id), capacityUnitId: String(record.get('capacityId')),
          requirement: String(record.get('requirementKey')), summary: String(record.get('exceptionSummary') || rule.summary),
          effect: toNumber(rule.effect), confidence: toNumber(rule.confidence), applies: true, source: 'operating-rule' as const,
          scope: 'precinct' as const,
        }
      }),
      ...outcomeResult.records.map((record) => {
        const outcome = properties(record.get('outcome'))
        return {
          id: String(outcome.id), capacityUnitId: String(record.get('capacityId')),
          requirement: String(record.get('requirementKey')), summary: String(outcome.summary || `A comparable user rated this option ${outcome.feedback}.`),
          effect: toNumber(outcome.effect), confidence: toNumber(outcome.confidence, 0.55), applies: true, source: 'outcome' as const,
          scope: String(outcome.scope || 'cohort') as 'personal' | 'cohort' | 'precinct',
        }
      }),
      ...(personalIssueResult?.records ?? []).map((record) => {
        const report = properties(record.get('report'))
        return {
          id: String(report.id), capacityUnitId: String(record.get('capacityId')),
          requirement: String(record.get('requirementKey')), summary: String(report.summary),
          effect: toNumber(report.severity, 2) * 8, confidence: 0.6, applies: true,
          source: 'outcome' as const, scope: 'personal' as const,
        }
      }),
    ]
    return { backend: this.backend, candidates, memories }
  }

  async recordOutcome(input: GraphOutcomeWrite) {
    await this.ensureSeeded()
    const requirement = primaryRequirement(input.demand)
    const feedbackEffect = input.feedback === 'worse' ? 25 : input.feedback === 'better' ? -8 : 0
    await this.run(`
      MATCH (capacity:CapacityUnit {id: $capacityUnitId})
      MERGE (requirement:Requirement {key: $requirement})
      MERGE (context:Context {id: $contextId})
      SET context.name = 'Observed journey context', context.uvIndex = $uvIndex, context.crowding = $crowding, context.requestedAt = $requestedAt
      MERGE (demand:Demand {id: $decisionId})
      SET demand.intent = $intent, demand.originalText = $originalText
      MERGE (decision:Decision {id: $decisionId})
      ON CREATE SET decision.createdAt = $createdAt
      SET decision.name = 'Selected ' + capacity.name
      MERGE (outcome:Outcome {id: $outcomeId})
      ON CREATE SET outcome.createdAt = $createdAt
      SET outcome.name = $outcomeName, outcome.feedback = $feedback, outcome.metricsJson = $metricsJson,
          outcome.effect = $feedbackEffect, outcome.confidence = 0.55,
          outcome.summary = $summary,
          outcome.scope = 'personal', outcome.profileId = $profileId
      MERGE (demand)-[:REQUIRES]->(requirement)
      MERGE (decision)-[:RESPONDS_TO]->(demand)
      MERGE (decision)-[:SELECTED]->(capacity)
      MERGE (decision)-[:PRODUCED]->(outcome)
      MERGE (capacity)-[:HAS_OUTCOME]->(outcome)
      MERGE (outcome)-[:FOR_REQUIREMENT]->(requirement)
      MERGE (outcome)-[:UNDER_CONTEXT]->(context)
    `, {
      capacityUnitId: input.capacityUnitId, requirement, contextId: `context-${input.id}`,
      uvIndex: input.context.uvIndex, crowding: input.context.crowding, requestedAt: input.context.requestedAt,
      decisionId: input.decisionId, intent: input.demand.intent, originalText: input.demand.originalText,
      outcomeId: input.id, feedback: input.feedback || 'measured', metricsJson: JSON.stringify(input.metrics),
      outcomeName: input.feedback ? `${input.feedback[0].toUpperCase()}${input.feedback.slice(1)} journey outcome` : 'Measured intervention outcome',
      feedbackEffect, summary: input.feedback ? `A comparable user rated this option ${input.feedback}.` : 'Measured outcome recorded.',
      profileId: input.context.profileId || '',
      createdAt: new Date().toISOString(),
    })

    const memoryIds: string[] = input.feedback ? [input.id] : []
    if (input.demand.intent === 'movement' && input.feedback === 'worse' && requirement === 'low-uv') {
      await this.run(`
        MATCH (capacity:CapacityUnit {id: $capacityUnitId})-[:HAS_OUTCOME]->(outcome:Outcome)-[:FOR_REQUIREMENT]->(:Requirement {key: $requirement})
        MATCH (outcome)-[:UNDER_CONTEXT]->(context:Context)
      WHERE outcome.feedback = 'worse' AND context.uvIndex >= 3
        WITH capacity,
             count(outcome) AS reportCount,
             count(DISTINCT CASE WHEN coalesce(outcome.profileId, '') = '' THEN outcome.id ELSE outcome.profileId END) AS reporterCount,
             min(outcome.createdAt) AS firstReportedAt,
             max(outcome.createdAt) AS lastReportedAt,
             min(context.uvIndex) AS uvMin,
             min(context.crowding) AS crowdingMin
        WHERE reporterCount >= $threshold
        MERGE (candidate:RouteException {id: $candidateId})
        ON CREATE SET candidate.status = 'candidate', candidate.createdAt = lastReportedAt
        SET candidate.capacityUnitId = capacity.id,
            candidate.capacityName = capacity.name,
            candidate.requirement = $requirement,
            candidate.reportCount = reportCount,
            candidate.independentReporterCount = reporterCount,
            candidate.uvMin = uvMin,
            candidate.crowdingMin = crowdingMin,
            candidate.firstReportedAt = firstReportedAt,
            candidate.lastReportedAt = lastReportedAt
        MERGE (candidate)-[:ABOUT]->(capacity)
      `, {
        capacityUnitId: input.capacityUnitId,
        requirement,
        threshold: routeExceptionThreshold(),
        candidateId: routeExceptionId(input.capacityUnitId, requirement),
      })
    }
    const workspaceIssues = input.demand.intent === 'workspace'
      ? (input.workspaceIssues ?? []).map((issue, index) => ({
          id: `${input.id}-workspace-issue-${index}`,
          issue: issue.issue,
          requirement: workspaceIssueRequirement(issue),
          detail: issue.detail || '',
          facility: issue.facility || '',
          severity: issue.severity ?? 2,
          summary: workspaceIssueSummary(issue),
        }))
      : []
    if (workspaceIssues.length) {
      await this.run(`
        MATCH (capacity:CapacityUnit {id: $capacityUnitId})
        MATCH (outcome:Outcome {id: $outcomeId})
        UNWIND $issues AS row
        MERGE (requirement:Requirement {key: row.requirement})
        MERGE (report:IssueReport {id: row.id})
        ON CREATE SET report.createdAt = $createdAt
        SET report.issue = row.issue,
            report.requirement = row.requirement,
            report.detail = row.detail,
            report.facility = row.facility,
            report.severity = row.severity,
            report.summary = row.summary,
            report.profileId = $profileId
        MERGE (capacity)-[:HAS_ISSUE_REPORT]->(report)
        MERGE (outcome)-[:REPORTED]->(report)
        MERGE (report)-[:FOR_REQUIREMENT]->(requirement)
      `, {
        capacityUnitId: input.capacityUnitId,
        outcomeId: input.id,
        issues: workspaceIssues,
        profileId: input.context.profileId || '',
        createdAt: new Date().toISOString(),
      })
      for (const issue of workspaceIssues) {
        await this.run(`
          MATCH (capacity:CapacityUnit {id: $capacityUnitId})-[:HAS_ISSUE_REPORT]->(report:IssueReport)
          WHERE report.issue = $issue AND coalesce(report.facility, '') = $facility
          WITH capacity, report.issue AS issue, report.requirement AS requirement,
               coalesce(report.facility, '') AS facility,
               count(report) AS reportCount,
               count(DISTINCT CASE WHEN coalesce(report.profileId, '') = '' THEN report.id ELSE report.profileId END) AS reporterCount,
               min(report.createdAt) AS firstReportedAt,
               max(report.createdAt) AS lastReportedAt
          WHERE reporterCount >= $threshold
          MERGE (candidate:WorkspaceIssue {id: $candidateId})
          ON CREATE SET candidate.status = 'candidate', candidate.createdAt = lastReportedAt
          SET candidate.capacityUnitId = capacity.id,
              candidate.capacityName = capacity.name,
              candidate.issue = issue,
              candidate.requirement = requirement,
              candidate.facility = facility,
              candidate.reportCount = reportCount,
              candidate.independentReporterCount = reporterCount,
              candidate.firstReportedAt = firstReportedAt,
              candidate.lastReportedAt = lastReportedAt
          MERGE (candidate)-[:ABOUT]->(capacity)
        `, {
          capacityUnitId: input.capacityUnitId,
          issue: issue.issue,
          facility: issue.facility,
          threshold: workspaceIssueThreshold(),
          candidateId: workspaceIssueId(input.capacityUnitId, issue),
        })
      }
      memoryIds.push(...workspaceIssues.map((issue) => issue.id))
    }
    if (input.candidateRule) {
      const rule = input.candidateRule
      await this.run(`
        MERGE (context:Context {id: $contextId})
        SET context.name = $contextName, context.place = $place, context.uvMin = $uvMin, context.crowdingMin = $crowdingMin
        MERGE (rule:OperatingRule {id: $ruleId})
        SET rule.name = $ruleName, rule.summary = $summary, rule.effect = $effect, rule.confidence = $confidence, rule.createdAt = $createdAt
        MERGE (exception:Exception {id: $exceptionId})
        SET exception.name = $exceptionName, exception.summary = $exceptionSummary
        MERGE (requirement:Requirement {key: $requirement})
        MERGE (evidence:Evidence {id: $evidenceId})
        SET evidence.kind = 'reviewed-pilot-outcome', evidence.outcomeId = $outcomeId
        MERGE (rule)-[:UNDER_CONTEXT]->(context)
        MERGE (rule)-[:HAS_EXCEPTION]->(exception)
        MERGE (exception)-[:AFFECTS]->(requirement)
        MERGE (rule)-[:SUPPORTED_BY]->(evidence)
        WITH rule
        MATCH (capacity:CapacityUnit {routeCode: $routeCode})
        MERGE (rule)-[:APPLIES_TO]->(capacity)
      `, {
        contextId: `context-${rule.id}`, place: rule.context.place, uvMin: rule.context.uvMin,
        crowdingMin: rule.context.crowdingMin, contextName: `${rule.context.place} · UV ≥ ${rule.context.uvMin}`,
        ruleId: rule.id, ruleName: `Route ${rule.routeId} operating boundary`,
        summary: `Route ${rule.routeId} improved average flow but increased ${rule.exception.metric} for ${rule.exception.functionalNeed} journeys.`,
        effect: rule.exception.delta, confidence: rule.confidence, createdAt: rule.createdAt,
        exceptionId: `exception-${rule.id}`, exceptionName: `${rule.exception.functionalNeed} · +${rule.exception.delta}% ${rule.exception.metric}`,
        exceptionSummary: `${rule.exception.metric} increased by ${rule.exception.delta}% in the measured comparison.`,
        requirement: rule.exception.functionalNeed, evidenceId: `evidence-${input.id}`, outcomeId: input.id, routeCode: rule.routeId,
      })
      memoryIds.push(rule.id)
    }
    let candidateCapacityId: string | undefined
    if (input.shareTrace && (input.feedback === 'better' || !input.feedback) && input.demand.intent === 'movement' && (input.journeyTrace?.length ?? 0) >= 3) {
      candidateCapacityId = `candidate-route-${input.id}`
      await this.run(`
        MATCH (source:CapacityUnit {id: $sourceCapacityUnitId})-[:LOCATED_AT]->(place:Place)
        MATCH (outcome:Outcome {id: $outcomeId})
        MERGE (candidate:CapacityUnit:CandidateRoute {id: $candidateCapacityId})
        ON CREATE SET candidate.kind = 'movement', candidate.productId = $candidateCapacityId,
            candidate.status = 'candidate',
            candidate.name = $name,
            candidate.destinationId = source.destinationId,
            candidate.durationMinutes = coalesce($durationMinutes, source.durationMinutes),
            candidate.distanceMetres = source.distanceMetres,
            candidate.shadePercent = source.shadePercent,
            candidate.directUvFactor = source.directUvFactor,
            candidate.stepFree = source.stepFree,
            candidate.safeCapacity = source.safeCapacity,
            candidate.baselineDemandShare = 0.05,
            candidate.acceptedRecommendations = 0,
            candidate.facilities = source.facilities + ['Worker-discovered path'],
            candidate.availability = source.availability,
            candidate.geometryJson = $geometryJson,
            candidate.sampleCount = $sampleCount,
            candidate.evidenceCount = 1,
            candidate.requirement = $requirement,
            candidate.metricsJson = $metricsJson,
            candidate.feedback = $candidateFeedback,
            candidate.createdAt = $createdAt
        MERGE (candidate)-[:LOCATED_AT]->(place)
        MERGE (candidate)-[:DERIVED_FROM]->(source)
        MERGE (outcome)-[:SUGGESTS]->(candidate)
      `, {
        sourceCapacityUnitId: input.capacityUnitId,
        outcomeId: input.id,
        candidateCapacityId,
        name: input.candidateRouteName || 'Worker-discovered path',
        durationMinutes: input.metrics.predictedMinutes ?? null,
        geometryJson: JSON.stringify(input.journeyTrace),
        sampleCount: input.journeyTrace!.length,
        requirement,
        metricsJson: JSON.stringify(input.metrics),
        candidateFeedback: input.feedback === 'better' ? 'better' : 'proposed',
        createdAt: new Date().toISOString(),
      })
    }
    return { outcomeId: input.id, memoryIds: [...new Set(memoryIds)], candidateCapacityId }
  }

  async listCandidateRoutes(status?: CandidateRouteStatus) {
    await this.ensureSeeded()
    const result = await this.run(`
      MATCH (candidate:CandidateRoute)-[:DERIVED_FROM]->(source:CapacityUnit)
      MATCH (candidate)-[:LOCATED_AT]->(place:Place)
      WHERE $status = '' OR candidate.status = $status
      RETURN candidate, source.id AS sourceCapacityUnitId, place.id AS placeId
      ORDER BY candidate.createdAt DESC
    `, { status: status || '' })
    return result.records.map((record) => candidateRecord(
      properties(record.get('candidate')),
      String(record.get('sourceCapacityUnitId')),
      String(record.get('placeId')),
    ))
  }

  async reviewCandidateRoute(input: {
    candidateCapacityId: string
    decision: 'validate' | 'reject'
    reason: string
    evidence?: CandidateRouteEvidence
  }) {
    await this.ensureSeeded()
    const status = input.decision === 'validate' ? 'validated' : 'rejected'
    const reviewedAt = new Date().toISOString()
    const evidence = input.evidence ?? {}
    const result = await this.run(`
      MATCH (candidate:CandidateRoute {id: $candidateCapacityId})-[:DERIVED_FROM]->(source:CapacityUnit)
      MATCH (candidate)-[:LOCATED_AT]->(place:Place)
      WHERE candidate.status IN ['candidate', 'under-validation']
      SET candidate.status = $status,
          candidate.reviewedAt = $reviewedAt,
          candidate.reviewReason = $reason,
          candidate.validationConfidence = $confidence,
          candidate.evidenceCount = coalesce(candidate.evidenceCount, 1) + 1,
          candidate.durationMinutes = CASE WHEN $status = 'validated' THEN coalesce($durationMinutes, candidate.durationMinutes, source.durationMinutes) ELSE candidate.durationMinutes END,
          candidate.distanceMetres = CASE WHEN $status = 'validated' THEN coalesce($distanceMetres, candidate.distanceMetres, source.distanceMetres) ELSE candidate.distanceMetres END,
          candidate.shadePercent = CASE WHEN $status = 'validated' THEN coalesce($shadePercent, candidate.shadePercent, source.shadePercent) ELSE candidate.shadePercent END,
          candidate.directUvFactor = CASE WHEN $status = 'validated' THEN coalesce($directUvFactor, candidate.directUvFactor, source.directUvFactor) ELSE candidate.directUvFactor END,
          candidate.safeCapacity = CASE WHEN $status = 'validated' THEN coalesce($safeCapacity, candidate.safeCapacity, source.safeCapacity) ELSE candidate.safeCapacity END,
          candidate.stepFree = CASE WHEN $status = 'validated' THEN coalesce($stepFree, candidate.stepFree, source.stepFree) ELSE candidate.stepFree END,
          candidate.baselineDemandShare = CASE WHEN $status = 'validated' THEN coalesce($baselineDemandShare, candidate.baselineDemandShare, 0.05) ELSE candidate.baselineDemandShare END
      MERGE (validation:Evidence {id: 'validation-' + candidate.id})
      SET validation.kind = 'cdh-route-validation', validation.decision = $status,
          validation.reason = $reason, validation.confidence = $confidence,
          validation.createdAt = $reviewedAt
      MERGE (candidate)-[:REVIEWED_BY]->(validation)
      FOREACH (_ IN CASE WHEN $status = 'validated' THEN [1] ELSE [] END |
        MERGE (requirement:Requirement {key: candidate.requirement})
        MERGE (outcome:Outcome {id: 'validation-outcome-' + candidate.id})
        SET outcome.name = 'CDH route validation', outcome.feedback = 'better',
            outcome.scope = 'cohort', outcome.effect = -6.0,
            outcome.confidence = coalesce(candidate.validationConfidence, 0.7),
            outcome.summary = 'CDH validated this worker-discovered route: ' + candidate.reviewReason,
            outcome.createdAt = candidate.reviewedAt
        MERGE (candidate)-[:HAS_OUTCOME]->(outcome)
        MERGE (outcome)-[:FOR_REQUIREMENT]->(requirement)
      )
      RETURN candidate, source.id AS sourceCapacityUnitId, place.id AS placeId
    `, {
      candidateCapacityId: input.candidateCapacityId, status, reviewedAt, reason: input.reason,
      confidence: evidence.confidence ?? null, durationMinutes: evidence.durationMinutes ?? null,
      distanceMetres: evidence.distanceMetres ?? null, shadePercent: evidence.shadePercent ?? null,
      directUvFactor: evidence.directUvFactor ?? null, safeCapacity: evidence.safeCapacity ?? null,
      stepFree: evidence.stepFree ?? null, baselineDemandShare: evidence.baselineDemandShare ?? null,
    })
    const record = result.records[0]
    if (!record) throw new Error(`Candidate route ${input.candidateCapacityId} was not found or has already been reviewed.`)
    return candidateRecord(properties(record.get('candidate')), String(record.get('sourceCapacityUnitId')), String(record.get('placeId')))
  }

  async listWorkspaceIssues(status?: WorkspaceIssueStatus) {
    await this.ensureSeeded()
    const result = await this.run(`
      MATCH (capacity:CapacityUnit)-[:HAS_ISSUE_REPORT]->(report:IssueReport)
      WITH capacity, report.issue AS issue, report.requirement AS requirement,
           coalesce(report.facility, '') AS facility,
           count(report) AS reportCount,
           count(DISTINCT CASE WHEN coalesce(report.profileId, '') = '' THEN report.id ELSE report.profileId END) AS reporterCount,
           min(report.createdAt) AS firstReportedAt,
           max(report.createdAt) AS lastReportedAt,
           [detail IN collect(DISTINCT report.detail) WHERE detail <> ''][0..3] AS details
      WITH capacity, issue, requirement, facility, reportCount, reporterCount, firstReportedAt, lastReportedAt, details,
           'workspace-issue-' + replace(toLower(capacity.id), ' ', '-') + '-' + issue
             + CASE WHEN facility = '' THEN '' ELSE '-' + replace(toLower(facility), ' ', '-') END AS issueId
      OPTIONAL MATCH (candidate:WorkspaceIssue {id: issueId})
      WITH capacity, issue, requirement, reportCount, reporterCount, firstReportedAt, lastReportedAt, details, issueId, candidate,
           CASE
             WHEN candidate.status IS NOT NULL THEN candidate.status
             WHEN reporterCount >= $threshold THEN 'candidate'
             ELSE 'collecting'
           END AS resolvedStatus
      WHERE $status = '' OR resolvedStatus = $status
      RETURN capacity.id AS capacityUnitId, capacity.name AS capacityName,
             issue, requirement, reportCount, reporterCount, firstReportedAt, lastReportedAt,
             details, issueId, resolvedStatus,
             candidate.reviewedAt AS reviewedAt, candidate.reviewReason AS reviewReason
      ORDER BY reporterCount DESC, lastReportedAt DESC
    `, { threshold: workspaceIssueThreshold(), status: status || '' })
    return result.records.map((record) => ({
      id: String(record.get('issueId')),
      capacityUnitId: String(record.get('capacityUnitId')),
      capacityName: String(record.get('capacityName')),
      issue: String(record.get('issue')) as WorkspaceIssueRecord['issue'],
      requirement: String(record.get('requirement')),
      status: String(record.get('resolvedStatus')) as WorkspaceIssueStatus,
      reportCount: toNumber(record.get('reportCount')),
      independentReporterCount: toNumber(record.get('reporterCount')),
      firstReportedAt: String(record.get('firstReportedAt')),
      lastReportedAt: String(record.get('lastReportedAt')),
      reviewedAt: record.get('reviewedAt') ? String(record.get('reviewedAt')) : undefined,
      reviewReason: record.get('reviewReason') ? String(record.get('reviewReason')) : undefined,
      sampleDetails: stringArray(record.get('details')),
    }))
  }

  async reviewWorkspaceIssue(input: { issueId: string; decision: 'validate' | 'reject'; reason: string }) {
    await this.ensureSeeded()
    const status = input.decision === 'validate' ? 'validated' : 'rejected'
    const reviewedAt = new Date().toISOString()
    const result = await this.run(`
      MATCH (candidate:WorkspaceIssue {id: $issueId})-[:ABOUT]->(capacity:CapacityUnit)
      WHERE candidate.status = 'candidate'
      SET candidate.status = $status,
          candidate.reviewedAt = $reviewedAt,
          candidate.reviewReason = $reason
      FOREACH (_ IN CASE WHEN $status = 'validated' THEN [1] ELSE [] END |
        MERGE (requirement:Requirement {key: candidate.requirement})
        MERGE (outcome:Outcome {id: 'validated-' + candidate.id})
        SET outcome.name = 'Validated workspace suitability evidence',
            outcome.feedback = 'worse',
            outcome.scope = 'cohort',
            outcome.effect = 24.0,
            outcome.confidence = CASE
              WHEN candidate.independentReporterCount >= 7 THEN 0.90
              ELSE 0.55 + candidate.independentReporterCount * 0.05
            END,
            outcome.summary = toString(candidate.independentReporterCount) + ' independent reports confirmed: ' + $reason,
            outcome.createdAt = $reviewedAt
        MERGE (capacity)-[:HAS_OUTCOME]->(outcome)
        MERGE (outcome)-[:FOR_REQUIREMENT]->(requirement)
        MERGE (candidate)-[:VALIDATED_AS]->(outcome)
      )
      RETURN candidate, capacity
    `, { issueId: input.issueId, status, reviewedAt, reason: input.reason })
    if (!result.records[0]) throw new Error(`Workspace issue ${input.issueId} was not found or is not ready for review.`)
    const matching = (await this.listWorkspaceIssues(status)).find((issue) => issue.id === input.issueId)
    if (!matching) throw new Error(`Workspace issue ${input.issueId} could not be reloaded after review.`)
    return matching
  }

  async listRouteExceptions(status?: RouteExceptionStatus) {
    await this.ensureSeeded()
    const result = await this.run(`
      MATCH (capacity:CapacityUnit)-[:HAS_OUTCOME]->(outcome:Outcome)-[:FOR_REQUIREMENT]->(requirement:Requirement {key: 'low-uv'})
      MATCH (outcome)-[:UNDER_CONTEXT]->(context:Context)
      WHERE capacity.kind = 'movement' AND outcome.feedback = 'worse' AND context.uvIndex >= 3
      WITH capacity, requirement,
           count(outcome) AS reportCount,
           count(DISTINCT CASE WHEN coalesce(outcome.profileId, '') = '' THEN outcome.id ELSE outcome.profileId END) AS reporterCount,
           min(outcome.createdAt) AS firstReportedAt,
           max(outcome.createdAt) AS lastReportedAt,
           min(context.uvIndex) AS uvMin,
           min(context.crowding) AS crowdingMin
      WITH capacity, requirement, reportCount, reporterCount, firstReportedAt, lastReportedAt, uvMin, crowdingMin,
           'route-exception-' + replace(toLower(capacity.id), ' ', '-') + '-' + requirement.key AS exceptionId
      OPTIONAL MATCH (candidate:RouteException {id: exceptionId})
      WITH capacity, requirement, reportCount, reporterCount, firstReportedAt, lastReportedAt, uvMin, crowdingMin, exceptionId, candidate,
           CASE
             WHEN candidate.status IS NOT NULL THEN candidate.status
             WHEN reporterCount >= $threshold THEN 'candidate'
             ELSE 'collecting'
           END AS resolvedStatus
      WHERE $status = '' OR resolvedStatus = $status
      RETURN capacity.id AS capacityUnitId, capacity.name AS capacityName, requirement.key AS requirement,
             reportCount, reporterCount, firstReportedAt, lastReportedAt, uvMin, crowdingMin,
             exceptionId, resolvedStatus, candidate.reviewedAt AS reviewedAt, candidate.reviewReason AS reviewReason
      ORDER BY reporterCount DESC, lastReportedAt DESC
    `, { threshold: routeExceptionThreshold(), status: status || '' })
    return result.records.map((record) => ({
      id: String(record.get('exceptionId')),
      capacityUnitId: String(record.get('capacityUnitId')),
      capacityName: String(record.get('capacityName')),
      requirement: String(record.get('requirement')),
      status: String(record.get('resolvedStatus')) as RouteExceptionStatus,
      reportCount: toNumber(record.get('reportCount')),
      independentReporterCount: toNumber(record.get('reporterCount')),
      uvMin: toNumber(record.get('uvMin')),
      crowdingMin: toNumber(record.get('crowdingMin')),
      firstReportedAt: String(record.get('firstReportedAt')),
      lastReportedAt: String(record.get('lastReportedAt')),
      reviewedAt: record.get('reviewedAt') ? String(record.get('reviewedAt')) : undefined,
      reviewReason: record.get('reviewReason') ? String(record.get('reviewReason')) : undefined,
    } satisfies RouteExceptionRecord))
  }

  async reviewRouteException(input: { exceptionId: string; decision: 'validate' | 'reject'; reason: string }) {
    await this.ensureSeeded()
    const status = input.decision === 'validate' ? 'validated' : 'rejected'
    const reviewedAt = new Date().toISOString()
    const result = await this.run(`
      MATCH (candidate:RouteException {id: $exceptionId})-[:ABOUT]->(capacity:CapacityUnit)
      WHERE candidate.status = 'candidate'
      SET candidate.status = $status,
          candidate.reviewedAt = $reviewedAt,
          candidate.reviewReason = $reason
      FOREACH (_ IN CASE WHEN $status = 'validated' THEN [1] ELSE [] END |
        MERGE (requirement:Requirement {key: candidate.requirement})
        MERGE (context:Context {id: 'context-validated-' + candidate.id})
        SET context.name = 'Validated route boundary',
            context.uvMin = candidate.uvMin,
            context.crowdingMin = candidate.crowdingMin
        MERGE (rule:OperatingRule {id: 'validated-' + candidate.id})
        SET rule.name = capacity.name + ' operating boundary',
            rule.summary = toString(candidate.independentReporterCount) + ' similar journeys found this route unsuitable under comparable UV.',
            rule.effect = 50.0,
            rule.confidence = CASE
              WHEN candidate.independentReporterCount >= 7 THEN 0.90
              ELSE 0.55 + candidate.independentReporterCount * 0.05
            END,
            rule.createdAt = $reviewedAt
        MERGE (exception:Exception {id: 'exception-validated-' + candidate.id})
        SET exception.name = 'Repeated low-UV route mismatch',
            exception.summary = toString(candidate.independentReporterCount) + ' similar journeys found this route unsuitable under comparable UV.'
        MERGE (evidence:Evidence {id: 'evidence-validated-' + candidate.id})
        SET evidence.kind = 'validated-worker-outcomes',
            evidence.reportCount = candidate.reportCount,
            evidence.independentReporterCount = candidate.independentReporterCount,
            evidence.createdAt = $reviewedAt
        MERGE (rule)-[:APPLIES_TO]->(capacity)
        MERGE (rule)-[:UNDER_CONTEXT]->(context)
        MERGE (rule)-[:HAS_EXCEPTION]->(exception)
        MERGE (exception)-[:AFFECTS]->(requirement)
        MERGE (rule)-[:SUPPORTED_BY]->(evidence)
        MERGE (candidate)-[:VALIDATED_AS]->(rule)
      )
      RETURN candidate
    `, { exceptionId: input.exceptionId, status, reviewedAt, reason: input.reason })
    if (!result.records[0]) throw new Error(`Route exception ${input.exceptionId} was not found or is not ready for review.`)
    const matching = (await this.listRouteExceptions(status)).find((exception) => exception.id === input.exceptionId)
    if (!matching) throw new Error(`Route exception ${input.exceptionId} could not be reloaded after review.`)
    return matching
  }
}

function candidateRecord(data: Record<string, unknown>, sourceCapacityUnitId: string, placeId: string): CandidateRouteRecord {
  const parseJson = <T>(value: unknown, fallback: T): T => {
    try { return JSON.parse(String(value)) as T } catch { return fallback }
  }
  const geometry = parseJson<[number, number][]>(data.geometryJson || '[]', [])
  const metrics = parseJson<Record<string, number>>(data.metricsJson || '{}', {})
  return {
    id: String(data.id), name: String(data.name), sourceCapacityUnitId, placeId,
    destinationId: data.destinationId ? String(data.destinationId) : null,
    status: String(data.status) as CandidateRouteStatus, geometry,
    createdAt: String(data.createdAt), reviewedAt: data.reviewedAt ? String(data.reviewedAt) : undefined,
    reviewReason: data.reviewReason ? String(data.reviewReason) : undefined,
    feedback: data.feedback === 'proposed' ? 'proposed' : 'better', sampleCount: toNumber(data.sampleCount), evidenceCount: toNumber(data.evidenceCount, 1),
    requirement: String(data.requirement || 'standard'), metrics,
    validationConfidence: data.validationConfidence == null ? undefined : toNumber(data.validationConfidence),
  }
}

const fallbackGraph = new InMemoryCapacityGraph()

export function graphConfigured() {
  return neo4jConfigured()
}

export function getGraphRepository(): GraphRepository {
  return neo4jConfigured() ? new Neo4jCapacityGraph() : fallbackGraph
}

export function getFallbackGraph() {
  return fallbackGraph
}
