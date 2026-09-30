export type DemandIntent = 'movement' | 'workspace'
export type RequirementStrength = 'required' | 'preferred'

export interface DemandRequirements {
  lowUv: boolean
  stepFree: boolean
  accessible: boolean
  hybridEquipment: boolean
  equipment: string[]
}

export interface DemandPreferences {
  crowding: 'lower' | 'standard'
  uv: 'lower' | 'standard'
}

export interface StructuredDemand {
  intent: DemandIntent
  originalText: string
  destinationText: string | null
  destinationId: string | null
  arrivalDeadline: string | null
  departureFlexibilityMinutes: number
  startTime: string | null
  durationMinutes: number
  capacityRequired: number
  requirements: DemandRequirements
  preferences: DemandPreferences
  requirementStrength: RequirementStrength
  requesterOrganisation: string | null
  confidence: number
  unresolvedFields: string[]
}

export interface DecisionContext {
  uvIndex: number
  temperature: number
  crowding: number
  workers: number
  requestedAt: string
  acceptedRecommendations?: Record<string, number>
  profileId?: string
}

export interface RetrievedMemory {
  id: string
  capacityUnitId: string
  requirement: string
  summary: string
  effect: number
  confidence: number
  applies: boolean
  source: 'operating-rule' | 'outcome'
  scope?: 'personal' | 'cohort' | 'precinct'
}

export type CandidateRouteStatus = 'candidate' | 'under-validation' | 'validated' | 'rejected'
export type WorkspaceIssueKey = 'temperature' | 'equipment' | 'blinds' | 'acoustics' | 'accessibility' | 'other'
export type WorkspaceIssueStatus = 'collecting' | 'candidate' | 'validated' | 'rejected'
export type RouteExceptionStatus = 'collecting' | 'candidate' | 'validated' | 'rejected'

export interface RouteExceptionRecord {
  id: string
  capacityUnitId: string
  capacityName: string
  requirement: string
  status: RouteExceptionStatus
  reportCount: number
  independentReporterCount: number
  uvMin: number
  crowdingMin: number
  firstReportedAt: string
  lastReportedAt: string
  reviewedAt?: string
  reviewReason?: string
}

export interface WorkspaceIssueInput {
  issue: WorkspaceIssueKey
  detail?: string
  facility?: string
  severity?: 1 | 2 | 3
}

export interface WorkspaceIssueRecord {
  id: string
  capacityUnitId: string
  capacityName: string
  issue: WorkspaceIssueKey
  requirement: string
  status: WorkspaceIssueStatus
  reportCount: number
  independentReporterCount: number
  firstReportedAt: string
  lastReportedAt: string
  reviewedAt?: string
  reviewReason?: string
  sampleDetails: string[]
}

export interface CandidateRouteRecord {
  id: string
  name: string
  sourceCapacityUnitId: string
  placeId: string
  destinationId: string | null
  status: CandidateRouteStatus
  geometry: [number, number][]
  createdAt: string
  reviewedAt?: string
  reviewReason?: string
  feedback: 'better' | 'proposed'
  sampleCount: number
  evidenceCount: number
  requirement: string
  metrics: Record<string, number>
  validationConfidence?: number
}

export interface CandidateRouteEvidence {
  durationMinutes?: number
  distanceMetres?: number
  shadePercent?: number
  directUvFactor?: number
  safeCapacity?: number
  stepFree?: boolean
  baselineDemandShare?: number
  confidence?: number
}

export interface RankedCapacityOption {
  id: string
  productId: string
  kind: DemandIntent
  name: string
  eligible: boolean
  recommended: boolean
  score: number
  reasons: string[]
  explanation: string
  durationMinutes?: number
  suggestedDelayMinutes?: number
  predictedDemand?: number
  safeCapacity: number
  remainingCapacity: number
  capacityEvidence?: 'verified' | 'unknown'
  shadePercent?: number
  exposureIndex?: number
  stepFree?: boolean
  facilities?: string[]
  accessClass?: 'shared' | 'internal'
  availability?: string[]
  availableFrom?: string
  availableUntil?: string
  memory: RetrievedMemory[]
}

export interface RecommendRequest {
  action: 'recommend'
  brief?: string
  demand?: Partial<StructuredDemand>
  context: DecisionContext
  useMemory?: boolean
}

export interface RecommendResponse {
  action: 'recommend'
  demand: StructuredDemand
  parser: 'llm' | 'fallback' | 'structured'
  graph: 'neo4j' | 'in-memory'
  resolvedDestination: { id: string; name: string } | null
  clarification: string | null
  options: RankedCapacityOption[]
  recommendation: RankedCapacityOption | null
  explanation: string
  retrievedMemory: RetrievedMemory[]
  decisionId: string
}

export interface OutcomeRequest {
  action: 'outcome'
  decisionId: string
  capacityUnitId: string
  demand: StructuredDemand
  context: DecisionContext
  feedback?: 'better' | 'same' | 'worse'
  metrics: Record<string, number>
  candidateRule?: import('./domain.js').MemoryRule
  journeyTrace?: [number, number][]
  shareTrace?: boolean
  candidateRouteName?: string
  workspaceIssues?: WorkspaceIssueInput[]
}

export interface OutcomeResponse {
  action: 'outcome'
  stored: boolean
  graph: 'neo4j' | 'in-memory'
  outcomeId: string
  memoryIds: string[]
  candidateCapacityId?: string
}

export interface CandidateRoutesRequest {
  action: 'candidate-routes'
  status?: CandidateRouteStatus
}

export interface CandidateRoutesResponse {
  action: 'candidate-routes'
  graph: 'neo4j' | 'in-memory'
  candidates: CandidateRouteRecord[]
}

export interface CandidateRouteReviewRequest {
  action: 'candidate-route-review'
  candidateCapacityId: string
  decision: 'validate' | 'reject'
  reason: string
  evidence?: CandidateRouteEvidence
}

export interface CandidateRouteReviewResponse {
  action: 'candidate-route-review'
  graph: 'neo4j' | 'in-memory'
  candidate: CandidateRouteRecord
}

export interface WorkspaceIssuesRequest {
  action: 'workspace-issues'
  status?: WorkspaceIssueStatus
}

export interface WorkspaceIssuesResponse {
  action: 'workspace-issues'
  graph: 'neo4j' | 'in-memory'
  issues: WorkspaceIssueRecord[]
}

export interface WorkspaceIssueReviewRequest {
  action: 'workspace-issue-review'
  issueId: string
  decision: 'validate' | 'reject'
  reason: string
}

export interface WorkspaceIssueReviewResponse {
  action: 'workspace-issue-review'
  graph: 'neo4j' | 'in-memory'
  issue: WorkspaceIssueRecord
}

export interface RouteExceptionsRequest {
  action: 'route-exceptions'
  status?: RouteExceptionStatus
}

export interface RouteExceptionsResponse {
  action: 'route-exceptions'
  graph: 'neo4j' | 'in-memory'
  exceptions: RouteExceptionRecord[]
}

export interface RouteExceptionReviewRequest {
  action: 'route-exception-review'
  exceptionId: string
  decision: 'validate' | 'reject'
  reason: string
}

export interface RouteExceptionReviewResponse {
  action: 'route-exception-review'
  graph: 'neo4j' | 'in-memory'
  exception: RouteExceptionRecord
}

export type DecisionRequest = RecommendRequest | OutcomeRequest | CandidateRoutesRequest | CandidateRouteReviewRequest | WorkspaceIssuesRequest | WorkspaceIssueReviewRequest | RouteExceptionsRequest | RouteExceptionReviewRequest
export type DecisionResponse = RecommendResponse | OutcomeResponse | CandidateRoutesResponse | CandidateRouteReviewResponse | WorkspaceIssuesResponse | WorkspaceIssueReviewResponse | RouteExceptionsResponse | RouteExceptionReviewResponse
