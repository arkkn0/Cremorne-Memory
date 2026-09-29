export type FunctionalNeed = 'standard' | 'low-uv' | 'step-free'
export type DemoPhase = 'observe' | 'first-pass' | 'measured' | 'remembered' | 'replay'

export type RouteId = 'A' | 'B' | 'C'

export interface RouteOption {
  id: RouteId
  name: string
  descriptor: string
  minutes: number
  distanceM: number
  shadePct: number
  directUv: number
  capacity: number
  predictedLoad: number
  stepFree: boolean
  participatingAsset?: string
  path: string
  color: string
}

export interface Scenario {
  uvIndex: number
  temperature: number
  crowding: number
  workers: number
  departure: string
  weatherSource: 'live' | 'scenario'
}

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

export interface RouteEvaluation extends RouteOption {
  eligible: boolean
  score: number
  reasons: string[]
  memoryMatch?: MemoryRule
}

export interface SimulationResult {
  crowdingDelta: number
  walkingDelta: number
  uvDeltaLowUv: number
  mobilityFrictionDelta: number
  routeLoads: Record<RouteId, number>
}
