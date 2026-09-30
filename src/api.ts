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

async function decisionRequest<T>(request: RecommendRequest | OutcomeRequest | CandidateRoutesRequest | CandidateRouteReviewRequest | WorkspaceIssuesRequest | WorkspaceIssueReviewRequest | RouteExceptionsRequest | RouteExceptionReviewRequest): Promise<T> {
  const response = await fetch('/api/decision', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string }
    throw new Error(body.error || `Decision API returned ${response.status}`)
  }
  return response.json() as Promise<T>
}

export function recommendCapacity(input: Omit<RecommendRequest, 'action'>) {
  return decisionRequest<RecommendResponse>({ action: 'recommend', ...input })
}

export function recordGraphOutcome(input: Omit<OutcomeRequest, 'action'>) {
  return decisionRequest<OutcomeResponse>({ action: 'outcome', ...input })
}

export function getCandidateRoutes(input: Omit<CandidateRoutesRequest, 'action'> = {}) {
  return decisionRequest<CandidateRoutesResponse>({ action: 'candidate-routes', ...input })
}

export function reviewCandidateRoute(input: Omit<CandidateRouteReviewRequest, 'action'>) {
  return decisionRequest<CandidateRouteReviewResponse>({ action: 'candidate-route-review', ...input })
}

export function getWorkspaceIssues(input: Omit<WorkspaceIssuesRequest, 'action'> = {}) {
  return decisionRequest<WorkspaceIssuesResponse>({ action: 'workspace-issues', ...input })
}

export function reviewWorkspaceIssue(input: Omit<WorkspaceIssueReviewRequest, 'action'>) {
  return decisionRequest<WorkspaceIssueReviewResponse>({ action: 'workspace-issue-review', ...input })
}

export function getRouteExceptions(input: Omit<RouteExceptionsRequest, 'action'> = {}) {
  return decisionRequest<RouteExceptionsResponse>({ action: 'route-exceptions', ...input })
}

export function reviewRouteException(input: Omit<RouteExceptionReviewRequest, 'action'>) {
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
