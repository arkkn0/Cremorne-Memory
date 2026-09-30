import { randomUUID } from 'node:crypto'
import type {
  CandidateRouteReviewRequest, CandidateRouteReviewResponse, CandidateRoutesRequest, CandidateRoutesResponse,
  OutcomeRequest, OutcomeResponse,
  RecommendRequest, RecommendResponse, StructuredDemand,
  RouteExceptionReviewRequest, RouteExceptionReviewResponse, RouteExceptionsRequest, RouteExceptionsResponse,
  WorkspaceIssueReviewRequest, WorkspaceIssueReviewResponse, WorkspaceIssuesRequest, WorkspaceIssuesResponse,
} from '../src/api-contracts'
import { explainOptions } from './explanations.js'
import { getFallbackGraph, getGraphRepository } from './graph.js'
import type { GraphRepository } from './graph-types'
import { parseDemand } from './nlu.js'
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

export async function recordOutcome(
  request: OutcomeRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<OutcomeResponse> {
  const graph = await safeGraph(repository)
  const id = `outcome-${request.decisionId}`
  const stored = await graph.recordOutcome({
    id, decisionId: request.decisionId, capacityUnitId: request.capacityUnitId,
    demand: request.demand, context: request.context, feedback: request.feedback,
    metrics: request.metrics, candidateRule: request.candidateRule,
    journeyTrace: request.journeyTrace, shareTrace: request.shareTrace,
    candidateRouteName: request.candidateRouteName,
    workspaceIssues: request.workspaceIssues,
  })
  return {
    action: 'outcome', stored: true, graph: graph.backend,
    outcomeId: stored.outcomeId, memoryIds: stored.memoryIds,
    candidateCapacityId: stored.candidateCapacityId,
  }
}

export async function listWorkspaceIssues(
  request: WorkspaceIssuesRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<WorkspaceIssuesResponse> {
  const graph = await safeGraph(repository)
  return {
    action: 'workspace-issues',
    graph: graph.backend,
    issues: await graph.listWorkspaceIssues(request.status),
  }
}

export async function reviewWorkspaceIssue(
  request: WorkspaceIssueReviewRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<WorkspaceIssueReviewResponse> {
  if (!request.issueId?.trim()) throw new Error('A workspace issue id is required.')
  if (request.decision !== 'validate' && request.decision !== 'reject') {
    throw new Error('Workspace issue decision must be validate or reject.')
  }
  if (!request.reason?.trim()) throw new Error('A validation or rejection reason is required.')
  const graph = await safeGraph(repository)
  return {
    action: 'workspace-issue-review',
    graph: graph.backend,
    issue: await graph.reviewWorkspaceIssue({
      issueId: request.issueId.trim(),
      decision: request.decision,
      reason: request.reason.trim(),
    }),
  }
}

export async function listRouteExceptions(
  request: RouteExceptionsRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<RouteExceptionsResponse> {
  const graph = await safeGraph(repository)
  return {
    action: 'route-exceptions',
    graph: graph.backend,
    exceptions: await graph.listRouteExceptions(request.status),
  }
}

export async function reviewRouteException(
  request: RouteExceptionReviewRequest,
  repository: GraphRepository = getGraphRepository(),
): Promise<RouteExceptionReviewResponse> {
  if (!request.exceptionId?.trim()) throw new Error('A route exception id is required.')
  if (request.decision !== 'validate' && request.decision !== 'reject') {
    throw new Error('Route exception decision must be validate or reject.')
  }
  if (!request.reason?.trim()) throw new Error('A validation or rejection reason is required.')
  const graph = await safeGraph(repository)
  return {
    action: 'route-exception-review',
    graph: graph.backend,
    exception: await graph.reviewRouteException({
      exceptionId: request.exceptionId.trim(),
      decision: request.decision,
      reason: request.reason.trim(),
    }),
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
