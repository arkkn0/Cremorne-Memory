export type FunctionalNeed = 'standard' | 'low-uv' | 'step-free'
export type RouteId = 'A' | 'B' | 'C'

export interface MemoryRule {
  id: string
  createdAt: string
  context: {
    uvMin: number
    crowdingMin: number
    place: string
  }
  routeId: RouteId
  outcome: {
    crowdingDelta: number
    walkingDelta: number
  }
  exception: {
    functionalNeed: Exclude<FunctionalNeed, 'standard'>
    metric: string
    delta: number
  }
  confidence: number
  deploymentBoundary: string
}
