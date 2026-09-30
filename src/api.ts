import type {
  CandidateRouteReviewRequest,
  CandidateRouteReviewResponse,
  CandidateRoutesRequest,
  CandidateRoutesResponse,
  DecisionContext,
  ExperimentRequest,
  ExperimentResponse,
  OutcomeRequest,
  OutcomeResponse,
  RecommendRequest,
  RecommendResponse,
} from './api-contracts'

async function decisionRequest<T>(request: RecommendRequest | ExperimentRequest | OutcomeRequest | CandidateRoutesRequest | CandidateRouteReviewRequest): Promise<T> {
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

export function runControlledExperiment(input: Omit<ExperimentRequest, 'action'>) {
  return decisionRequest<ExperimentResponse>({ action: 'experiment', ...input })
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

export function currentDecisionContext({
  uvIndex,
  temperature = 31,
  crowding,
  workers,
}: {
  uvIndex: number
  temperature?: number
  crowding: number
  workers: number
}): DecisionContext {
  return { uvIndex, temperature, crowding, workers, requestedAt: new Date().toISOString() }
}
