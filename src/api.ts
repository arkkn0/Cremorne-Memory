import type {
  CandidateRouteReviewRequest,
  CandidateRouteReviewResponse,
  CandidateRoutesRequest,
  CandidateRoutesResponse,
  DecisionContext,
  OutcomeRequest,
  OutcomeResponse,
  RecommendRequest,
  RecommendResponse,
  RouteExceptionReviewRequest,
  RouteExceptionReviewResponse,
  RouteExceptionsRequest,
  RouteExceptionsResponse,
  WorkspaceIssueReviewRequest,
  WorkspaceIssueReviewResponse,
  WorkspaceIssuesRequest,
  WorkspaceIssuesResponse,
} from './api-contracts'
import type { CdhOperationsModel } from './cdh-operations'

export interface SystemServiceStatus {
  id: string
  label: string
  status: 'ready' | 'resilient' | 'connect-next' | 'pilot-ready'
  detail: string
}

export interface SystemStatus {
  product: string
  status: 'ready'
  decisionFlow: string
  graph: 'neo4j' | 'in-memory-fallback'
  nlu: 'llm' | 'fallback-parser'
  evidence: string
  checkedAt: string
  services: SystemServiceStatus[]
}

export async function getSystemStatus(): Promise<SystemStatus> {
  const response = await fetch('/api/health', { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Health API returned ${response.status}`)
  return response.json() as Promise<SystemStatus>
}

export async function getOperationsModel(): Promise<CdhOperationsModel> {
  const response = await fetch('/api/operations', { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Operations API returned ${response.status}`)
  return response.json() as Promise<CdhOperationsModel>
}

async function decisionRequest<T>(request: RecommendRequest | OutcomeRequest | CandidateRoutesRequest | CandidateRouteReviewRequest | WorkspaceIssuesRequest | WorkspaceIssueReviewRequest | RouteExceptionsRequest | RouteExceptionReviewRequest): Promise<T> {
  const controller = new AbortController()
  // Recommendation requests are prefetched as soon as the journey view opens.
  // Keep the client window long enough for a cold serverless + graph start while
  // preserving the instant warmed interaction used in the live experience.
  const timeoutMs = request.action === 'recommend' ? 12_000 : 8_000
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  let response: Response
  try {
    response = await fetch('/api/decision', {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Decision API returned ${response.status}`)
  }
  return response.json() as Promise<T>
}

const recommendationCache = new Map<string, Promise<RecommendResponse>>()

export function recommendCapacity(input: Omit<RecommendRequest, 'action'>) {
  const key = JSON.stringify({
    brief: input.brief,
    demand: input.demand,
    useMemory: input.useMemory,
    uv: Number(input.context.uvIndex.toFixed(1)),
    workers: input.context.workers,
    profileId: input.context.profileId,
  })
  const cached = recommendationCache.get(key)
  if (cached) return cached
  const pending = decisionRequest<RecommendResponse>({ action: 'recommend', ...input })
  recommendationCache.set(key, pending)
  void pending.catch(() => recommendationCache.delete(key))
  return pending
}

export function recordGraphOutcome(input: Omit<OutcomeRequest, 'action'>) {
  recommendationCache.clear()
  return decisionRequest<OutcomeResponse>({ action: 'outcome', ...input })
}

export function getCandidateRoutes(input: Omit<CandidateRoutesRequest, 'action'> = {}) {
  return decisionRequest<CandidateRoutesResponse>({ action: 'candidate-routes', ...input })
}

export function reviewCandidateRoute(input: Omit<CandidateRouteReviewRequest, 'action'>) {
  recommendationCache.clear()
  return decisionRequest<CandidateRouteReviewResponse>({ action: 'candidate-route-review', ...input })
}

export function getWorkspaceIssues(input: Omit<WorkspaceIssuesRequest, 'action'> = {}) {
  return decisionRequest<WorkspaceIssuesResponse>({ action: 'workspace-issues', ...input })
}

export function reviewWorkspaceIssue(input: Omit<WorkspaceIssueReviewRequest, 'action'>) {
  recommendationCache.clear()
  return decisionRequest<WorkspaceIssueReviewResponse>({ action: 'workspace-issue-review', ...input })
}

export function getRouteExceptions(input: Omit<RouteExceptionsRequest, 'action'> = {}) {
  return decisionRequest<RouteExceptionsResponse>({ action: 'route-exceptions', ...input })
}

export function reviewRouteException(input: Omit<RouteExceptionReviewRequest, 'action'>) {
  recommendationCache.clear()
  return decisionRequest<RouteExceptionReviewResponse>({ action: 'route-exception-review', ...input })
}

export function currentDecisionContext({
  uvIndex,
  temperature = 31,
  crowding,
  workers,
  profileId,
}: {
  uvIndex: number
  temperature?: number
  crowding: number
  workers: number
  profileId?: string
}): DecisionContext {
  return { uvIndex, temperature, crowding, workers, requestedAt: new Date().toISOString(), profileId }
}
