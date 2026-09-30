import type {
  CandidateRouteEvidence, CandidateRouteRecord, CandidateRouteStatus,
  DecisionContext, DemandIntent, RetrievedMemory, StructuredDemand, WorkspaceIssueInput, WorkspaceIssueRecord, WorkspaceIssueStatus,
} from '../src/api-contracts'
import type { MemoryRule } from '../src/domain'

export interface GraphPlace {
  id: string
  name: string
  aliases: string[]
}

export interface GraphCapacityUnit {
  id: string
  productId: string
  kind: DemandIntent
  name: string
  placeId: string
  destinationId?: string
  routeCode?: 'A' | 'B' | 'C'
  durationMinutes?: number
  distanceMetres?: number
  shadePercent?: number
  directUvFactor?: number
  stepFree?: boolean
  safeCapacity: number
  capacityEvidence?: 'verified' | 'unknown'
  baselineDemandShare?: number
  acceptedRecommendations: number
  facilities: string[]
  accessClass?: 'shared' | 'internal'
  ownerOrganisation?: string
  availability: string[]
}

export interface GraphNeighbourhood {
  backend: 'neo4j' | 'in-memory'
  candidates: GraphCapacityUnit[]
  memories: RetrievedMemory[]
}

export interface PlaceResolution {
  place: GraphPlace | null
  clarification: string | null
  confidence: number
}

export interface GraphOutcomeWrite {
  id: string
  decisionId: string
  capacityUnitId: string
  demand: StructuredDemand
  context: DecisionContext
  feedback?: 'better' | 'same' | 'worse'
  metrics: Record<string, number>
  candidateRule?: MemoryRule
  journeyTrace?: [number, number][]
  shareTrace?: boolean
  candidateRouteName?: string
  workspaceIssues?: WorkspaceIssueInput[]
}

export interface GraphRepository {
  readonly backend: 'neo4j' | 'in-memory'
  ensureSeeded(): Promise<void>
  resolvePlace(raw: string): Promise<PlaceResolution>
  retrieve(demand: StructuredDemand, context: DecisionContext, useMemory: boolean): Promise<GraphNeighbourhood>
  recordOutcome(input: GraphOutcomeWrite): Promise<{ outcomeId: string; memoryIds: string[]; candidateCapacityId?: string }>
  listCandidateRoutes(status?: CandidateRouteStatus): Promise<CandidateRouteRecord[]>
  reviewCandidateRoute(input: {
    candidateCapacityId: string
    decision: 'validate' | 'reject'
    reason: string
    evidence?: CandidateRouteEvidence
  }): Promise<CandidateRouteRecord>
  listWorkspaceIssues(status?: WorkspaceIssueStatus): Promise<WorkspaceIssueRecord[]>
  reviewWorkspaceIssue(input: {
    issueId: string
    decision: 'validate' | 'reject'
    reason: string
  }): Promise<WorkspaceIssueRecord>
}

