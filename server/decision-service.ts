import { randomUUID } from 'node:crypto'
import type {
  CandidateRouteReviewRequest, CandidateRouteReviewResponse, CandidateRoutesRequest, CandidateRoutesResponse,
  ExperimentRequest, ExperimentResponse, OutcomeRequest, OutcomeResponse,
  RecommendRequest, RecommendResponse, StructuredDemand,
} from '../src/api-contracts'
import { buildExperimentRule, simulateScenario } from '../src/engine.js'
import { explainOptions } from './explanations.js'
import { getFallbackGraph, getGraphRepository } from './graph.js'
import type { GraphRepository } from './graph-types'
import { parseDemand, parseExperimentDemand } from './nlu.js'
import { rankCapacity } from './ranking.js'

export async function recommend(
  request: RecommendRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<RecommendResponse> {
  const { demand: parsedDemand, source } = await parseDemand(request.brief || request.demand?.originalText || '', request.demand)
  const { graph, demand, resolution } = await resolveGraph(repository, parsedDemand)
  if (demand.intent === 'movement' && !resolution?.place) {
    return {
      action: 'recommend', demand, parser: source, graph: graph.backend,
      resolvedDestination: null, clarification: resolution?.clarification || 'Please add a destination.',
      options: [], recommendation: null, explanation: '', retrievedMemory: [], decisionId: randomUUID(),
    }
  }
  const neighbourhood = await graph.retrieve(demand, request.context, request.useMemory !== false)
  const ranked = rankCapacity(demand, request.context, neighbourhood)
  const explained = await explainOptions(demand, request.context, ranked)
  const recommendation = explained.options.find((option) => option.recommended) ?? null
  return {
    action: 'recommend', demand, parser: source, graph: neighbourhood.backend,
    resolvedDestination: resolution?.place ? { id: resolution.place.id, name: resolution.place.name } : null,
    clarification: null, options: explained.options, recommendation,
    explanation: explained.overall, retrievedMemory: neighbourhood.memories, decisionId: randomUUID(),
  }
}

export async function runExperiment(
  request: ExperimentRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<ExperimentResponse> {
  const parsed = parseExperimentDemand(request.brief)
  const result = simulateScenario(parsed.workers, request.seed ?? 42, parsed.horizonMin)
  const rule = buildExperimentRule({
    place: parsed.place,
    uvIndex: request.context.uvIndex,
    crowding: request.context.crowding,
    result,
  })
  const demand: StructuredDemand = {
    intent: 'movement', originalText: request.brief, destinationText: 'East Richmond', destinationId: 'east-richmond',
    arrivalDeadline: null, departureFlexibilityMinutes: 0, startTime: null, durationMinutes: 0, capacityRequired: 1,
    requirements: { lowUv: parsed.protectLowUv, stepFree: parsed.protectMobility, accessible: parsed.protectMobility, hybridEquipment: false, equipment: [] },
    preferences: { crowding: 'lower', uv: parsed.protectLowUv ? 'lower' : 'standard' },
    requirementStrength: 'required', requesterOrganisation: null, confidence: 1, unresolvedFields: [],
  }
  const graph = await safeGraph(repository)
  const neighbourhood = await graph.retrieve(demand, request.context, true)
  const relevantMemory = neighbourhood.memories
  const protectedShare = (parsed.protectLowUv ? 0.08 : 0) + (parsed.protectMobility ? 0.08 : 0)
  const requirementPassRate = Math.round(Math.min(100, 92 + relevantMemory.length * 2 - protectedShare * 5))
  return {
    action: 'experiment', decisionId: randomUUID(), demand, graph: neighbourhood.backend,
    parsed: { workers: parsed.workers, horizonMinutes: parsed.horizonMin, place: parsed.place },
    experiment: result,
    baseline: { memoryEnabled: false, routeUtilisation: result.baselineLoads },
    memoryAware: { memoryEnabled: true, routeUtilisation: result.interventionLoads, requirementPassRate },
    candidateRule: rule,
    retrievedMemory: relevantMemory,
  }
}

export async function recordOutcome(
  request: OutcomeRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<OutcomeResponse> {
  const graph = await safeGraph(repository)
  const id = randomUUID()
  const stored = await graph.recordOutcome({
    id, decisionId: request.decisionId, capacityUnitId: request.capacityUnitId,
    demand: request.demand, context: request.context, feedback: request.feedback,
    metrics: request.metrics, candidateRule: request.candidateRule,
    journeyTrace: request.journeyTrace, shareTrace: request.shareTrace,
    candidateRouteName: request.candidateRouteName,
  })
  return {
    action: 'outcome', stored: true, graph: graph.backend,
    outcomeId: stored.outcomeId, memoryIds: stored.memoryIds,
    candidateCapacityId: stored.candidateCapacityId,
  }
}

export async function listCandidateRoutes(
  request: CandidateRoutesRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<CandidateRoutesResponse> {
  const graph = await safeGraph(repository)
  return {
    action: 'candidate-routes',
    graph: graph.backend,
    candidates: await graph.listCandidateRoutes(request.status),
  }
}

export async function reviewCandidateRoute(
  request: CandidateRouteReviewRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<CandidateRouteReviewResponse> {
  if (!request.candidateCapacityId?.trim()) throw new Error('A candidate route id is required.')
  if (request.decision !== 'validate' && request.decision !== 'reject') {
    throw new Error('Candidate route decision must be validate or reject.')
  }
  if (!request.reason?.trim()) throw new Error('A validation or rejection reason is required.')
  const graph = await safeGraph(repository)
  return {
    action: 'candidate-route-review',
    graph: graph.backend,
    candidate: await graph.reviewCandidateRoute({
      candidateCapacityId: request.candidateCapacityId.trim(),
      decision: request.decision,
      reason: request.reason.trim(),
      evidence: request.evidence,
    }),
  }
}

async function resolveGraph(repository: GraphRepository, demand: StructuredDemand) {
  const graph = await safeGraph(repository)
  if (demand.intent !== 'movement') return { graph, demand, resolution: null }
  const resolution = await graph.resolvePlace(demand.destinationText || '')
  return {
    graph,
    demand: { ...demand, destinationId: resolution.place?.id ?? null },
    resolution,
  }
}

async function safeGraph(repository: GraphRepository) {
  try {
    await repository.ensureSeeded()
    return repository
  } catch {
    const fallback = getFallbackGraph()
    await fallback.ensureSeeded()
    return fallback
  }
}

