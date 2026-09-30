import neo4j, { type Driver, type QueryResult, type RecordShape } from 'neo4j-driver'
import type { DecisionContext, RetrievedMemory, StructuredDemand } from '../src/api-contracts'
import type { GraphCapacityUnit, GraphNeighbourhood, GraphOutcomeWrite, GraphPlace, GraphRepository, PlaceResolution } from './graph-types'
import { DEFAULT_CAPACITY_UNITS, DEFAULT_MEMORIES, DEFAULT_PLACES, WORKSPACE_MEMORY } from './default-graph'

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
  return keys.length ? keys : ['standard']
}

export class InMemoryCapacityGraph implements GraphRepository {
  readonly backend = 'in-memory' as const
  private readonly places = structuredClone(DEFAULT_PLACES)
  private readonly capacities = structuredClone(DEFAULT_CAPACITY_UNITS)
  private memories = structuredClone([...DEFAULT_MEMORIES, WORKSPACE_MEMORY])
  private outcomes: GraphOutcomeWrite[] = []
  private candidateRoutes: Array<{ id: string; sourceCapacityUnitId: string; trace: [number, number][] }> = []

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
      if (memory.source === 'operating-rule' && context.uvIndex < 7) return false
      return true
    }) : []
    return { backend: this.backend, candidates: structuredClone(candidates), memories: structuredClone(memories) }
  }

  async recordOutcome(input: GraphOutcomeWrite) {
    this.outcomes.push(structuredClone(input))
    const memoryIds: string[] = []
    if (input.feedback) {
      const requirement = input.demand.requirements.lowUv ? 'low-uv'
        : input.demand.requirements.stepFree ? 'mobility'
          : input.demand.intent === 'workspace' && input.demand.preferences.uv === 'lower' ? 'low-glare'
            : 'standard'
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
      }, ...this.memories]
      memoryIds.push(id)
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
        }, ...this.memories.filter((memory) => !(memory.id === input.candidateRule!.id && memory.capacityUnitId === capacity.id))]
      })
      memoryIds.push(input.candidateRule.id)
    }
    let candidateCapacityId: string | undefined
    if (input.shareTrace && input.feedback === 'better' && input.demand.intent === 'movement' && (input.journeyTrace?.length ?? 0) >= 3) {
      candidateCapacityId = `candidate-route-${input.id}`
      this.candidateRoutes.push({
        id: candidateCapacityId,
        sourceCapacityUnitId: input.capacityUnitId,
        trace: structuredClone(input.journeyTrace!),
      })
    }
    return { outcomeId: input.id, memoryIds: [...new Set(memoryIds)], candidateCapacityId }
  }
}

let cachedDriver: Driver | null = null
let seedPromise: Promise<void> | null = null

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
    if (process.env.CREMORNE_AUTO_SEED === 'false') return
    if (!seedPromise) seedPromise = this.seed()
    return seedPromise
  }

  private async run(query: string, parameters: Record<string, unknown> = {}): Promise<QueryResult<RecordShape>> {
    return this.driver.executeQuery(query, parameters, { database: database() })
  }

  private async seed() {
    const constraints = [
      'CREATE CONSTRAINT place_id IF NOT EXISTS FOR (n:Place) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT capacity_id IF NOT EXISTS FOR (n:CapacityUnit) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT rule_id IF NOT EXISTS FOR (n:OperatingRule) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT outcome_id IF NOT EXISTS FOR (n:Outcome) REQUIRE n.id IS UNIQUE',
      'CREATE CONSTRAINT requirement_key IF NOT EXISTS FOR (n:Requirement) REQUIRE n.key IS UNIQUE',
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
      { key: 'standard', name: 'Standard journey' },
    ] })

    await this.run(`
      MERGE (ctx:Context {id: 'high-uv-church-street'})
      SET ctx.name = 'High UV + rising crowding', ctx.place = 'Church Street', ctx.uvMin = 7.0, ctx.crowdingMin = 72.0
      MERGE (rule:OperatingRule {id: 'church-st-high-uv-route-b'})
      SET rule.name = 'Route B high-UV boundary', rule.summary = 'Route B improved average flow but increased exposure for low-UV journeys.',
          rule.effect = 40.0, rule.confidence = 0.82
      MERGE (exception:Exception {id: 'route-b-low-uv'})
      SET exception.name = 'Low-UV exposure +40%', exception.summary = 'Higher direct exposure in comparable high-UV conditions'
      MERGE (requirement:Requirement {key: 'low-uv'})
      MERGE (evidence:Evidence {id: 'synthetic-route-b-seed-42'})
      SET evidence.kind = 'synthetic-controlled', evidence.seed = 42
      MERGE (rule)-[:UNDER_CONTEXT]->(ctx)
      MERGE (rule)-[:HAS_EXCEPTION]->(exception)
      MERGE (exception)-[:AFFECTS]->(requirement)
      MERGE (rule)-[:SUPPORTED_BY]->(evidence)
      WITH rule
      MATCH (capacity:CapacityUnit {routeCode: 'B'})
      MERGE (rule)-[:APPLIES_TO]->(capacity)
    `)

    await this.run(`
      MATCH (capacity:CapacityUnit {id: 'workspace-boardroom'})
      MERGE (requirement:Requirement {key: 'low-glare'})
      MERGE (outcome:Outcome {id: 'boardroom-low-glare-outcome'})
      SET outcome.feedback = 'better', outcome.summary = $summary,
          outcome.effect = -12.0, outcome.confidence = 0.76,
          outcome.createdAt = '2026-09-30T00:00:00.000Z'
      MERGE (capacity)-[:HAS_OUTCOME]->(outcome)
      MERGE (outcome)-[:FOR_REQUIREMENT]->(requirement)
    `, { summary: WORKSPACE_MEMORY.summary })
  }

  async resolvePlace(raw: string) {
    await this.ensureSeeded()
    const result = await this.run('MATCH (p:Place) RETURN p')
    const places = result.records.map((record) => {
      const data = properties(record.get('p'))
      return { id: String(data.id), name: String(data.name), aliases: stringArray(data.aliases) }
    })
    return resolveAgainstPlaces(raw, places)
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
        safeCapacity: toNumber(data.safeCapacity), baselineDemandShare: data.baselineDemandShare == null ? undefined : toNumber(data.baselineDemandShare),
        acceptedRecommendations: toNumber(data.acceptedRecommendations), facilities: stringArray(data.facilities),
        accessClass: data.accessClass ? String(data.accessClass) as 'shared' | 'internal' : undefined,
        ownerOrganisation: data.ownerOrganisation ? String(data.ownerOrganisation) : undefined,
        availability: stringArray(data.availability),
      } satisfies GraphCapacityUnit
    })

    if (!useMemory || candidates.length === 0) return { backend: this.backend, candidates, memories: [] }
    const ids = candidates.map((candidate) => candidate.id)
    const requirements = relevantRequirementKeys(demand)
    const ruleResult = await this.run(`
      MATCH (rule:OperatingRule)-[:APPLIES_TO]->(capacity:CapacityUnit)
      MATCH (rule)-[:UNDER_CONTEXT]->(context:Context)
      MATCH (rule)-[:HAS_EXCEPTION]->(exception:Exception)-[:AFFECTS]->(requirement:Requirement)
      WHERE capacity.id IN $ids AND requirement.key IN $requirements
        AND coalesce(context.uvMin, 0.0) <= $uvIndex
        AND coalesce(context.crowdingMin, 0.0) <= $crowding
      RETURN rule, capacity.id AS capacityId, requirement.key AS requirementKey, exception.summary AS exceptionSummary
    `, { ids, requirements, uvIndex: context.uvIndex, crowding: context.crowding })
    const outcomeResult = await this.run(`
      MATCH (capacity:CapacityUnit)-[:HAS_OUTCOME]->(outcome:Outcome)-[:FOR_REQUIREMENT]->(requirement:Requirement)
      WHERE capacity.id IN $ids AND requirement.key IN $requirements
      RETURN capacity.id AS capacityId, outcome, requirement.key AS requirementKey
      ORDER BY outcome.createdAt DESC
      LIMIT 20
    `, { ids, requirements })

    const memories: RetrievedMemory[] = [
      ...ruleResult.records.map((record) => {
        const rule = properties(record.get('rule'))
        return {
          id: String(rule.id), capacityUnitId: String(record.get('capacityId')),
          requirement: String(record.get('requirementKey')), summary: String(record.get('exceptionSummary') || rule.summary),
          effect: toNumber(rule.effect), confidence: toNumber(rule.confidence), applies: true, source: 'operating-rule' as const,
        }
      }),
      ...outcomeResult.records.map((record) => {
        const outcome = properties(record.get('outcome'))
        return {
          id: String(outcome.id), capacityUnitId: String(record.get('capacityId')),
          requirement: String(record.get('requirementKey')), summary: String(outcome.summary || `A comparable user rated this option ${outcome.feedback}.`),
          effect: toNumber(outcome.effect), confidence: toNumber(outcome.confidence, 0.55), applies: true, source: 'outcome' as const,
        }
      }),
    ]
    return { backend: this.backend, candidates, memories }
  }

  async recordOutcome(input: GraphOutcomeWrite) {
    await this.ensureSeeded()
    const requirement = input.demand.requirements.lowUv ? 'low-uv'
      : input.demand.requirements.stepFree ? 'mobility'
        : input.demand.intent === 'workspace' && input.demand.preferences.uv === 'lower' ? 'low-glare'
          : 'standard'
    const feedbackEffect = input.feedback === 'worse' ? 25 : input.feedback === 'better' ? -8 : 0
    await this.run(`
      MATCH (capacity:CapacityUnit {id: $capacityUnitId})
      MERGE (requirement:Requirement {key: $requirement})
      MERGE (context:Context {id: $contextId})
      SET context.name = 'Observed journey context', context.uvIndex = $uvIndex, context.crowding = $crowding, context.requestedAt = $requestedAt
      MERGE (demand:Demand {id: $decisionId})
      SET demand.intent = $intent, demand.originalText = $originalText
      MERGE (decision:Decision {id: $decisionId})
      SET decision.name = 'Selected ' + capacity.name, decision.createdAt = $createdAt
      MERGE (outcome:Outcome {id: $outcomeId})
      SET outcome.name = $outcomeName, outcome.feedback = $feedback, outcome.metricsJson = $metricsJson,
          outcome.effect = $feedbackEffect, outcome.confidence = 0.55,
          outcome.summary = $summary, outcome.createdAt = $createdAt
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
      createdAt: new Date().toISOString(),
    })

    const memoryIds: string[] = input.feedback ? [input.id] : []
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
        SET evidence.kind = 'synthetic-controlled', evidence.outcomeId = $outcomeId
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
    if (input.shareTrace && input.feedback === 'better' && input.demand.intent === 'movement' && (input.journeyTrace?.length ?? 0) >= 3) {
      candidateCapacityId = `candidate-route-${input.id}`
      await this.run(`
        MATCH (source:CapacityUnit {id: $sourceCapacityUnitId})-[:LOCATED_AT]->(place:Place)
        MATCH (outcome:Outcome {id: $outcomeId})
        MERGE (candidate:CapacityUnit:CandidateRoute {id: $candidateCapacityId})
        SET candidate.kind = 'movement',
            candidate.status = 'candidate',
            candidate.name = $name,
            candidate.geometryJson = $geometryJson,
            candidate.sampleCount = $sampleCount,
            candidate.feedback = 'better',
            candidate.createdAt = $createdAt
        MERGE (candidate)-[:LOCATED_AT]->(place)
        MERGE (candidate)-[:DERIVED_FROM]->(source)
        MERGE (outcome)-[:SUGGESTS]->(candidate)
      `, {
        sourceCapacityUnitId: input.capacityUnitId,
        outcomeId: input.id,
        candidateCapacityId,
        name: input.candidateRouteName || 'Worker-discovered path',
        geometryJson: JSON.stringify(input.journeyTrace),
        sampleCount: input.journeyTrace!.length,
        createdAt: new Date().toISOString(),
      })
    }
    return { outcomeId: input.id, memoryIds: [...new Set(memoryIds)], candidateCapacityId }
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

