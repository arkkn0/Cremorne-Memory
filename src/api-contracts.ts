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

export interface ExperimentRequest {
  action: 'experiment'
  brief: string
  context: DecisionContext
  seed?: number
}

export interface ExperimentResult {
  crowdingDelta: number
  walkingDelta: number
  uvDeltaLowUv: number
  mobilityFrictionDelta: number
  baselineLoads: Record<'A' | 'B' | 'C', number>
  interventionLoads: Record<'A' | 'B' | 'C', number>
}

export interface ExperimentResponse {
  action: 'experiment'
  decisionId: string
  demand: StructuredDemand
  graph: 'neo4j' | 'in-memory'
  parsed: { workers: number; horizonMinutes: number; place: string }
  experiment: ExperimentResult
  baseline: { memoryEnabled: false; routeUtilisation: Record<'A' | 'B' | 'C', number> }
  memoryAware: { memoryEnabled: true; routeUtilisation: Record<'A' | 'B' | 'C', number>; requirementPassRate: number }
  candidateRule: import('./domain').MemoryRule
  retrievedMemory: RetrievedMemory[]
}

export interface OutcomeRequest {
  action: 'outcome'
  decisionId: string
  capacityUnitId: string
  demand: StructuredDemand
  context: DecisionContext
  feedback?: 'better' | 'same' | 'worse'
  metrics: Record<string, number>
  candidateRule?: import('./domain').MemoryRule
  journeyTrace?: [number, number][]
  shareTrace?: boolean
  candidateRouteName?: string
}

export interface OutcomeResponse {
  action: 'outcome'
  stored: boolean
  graph: 'neo4j' | 'in-memory'
  outcomeId: string
  memoryIds: string[]
  candidateCapacityId?: string
}

export type DecisionRequest = RecommendRequest | ExperimentRequest | OutcomeRequest
export type DecisionResponse = RecommendResponse | ExperimentResponse | OutcomeResponse
