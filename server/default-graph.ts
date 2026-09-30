import contextData from '../src/cremorne-context.json'
import { FIRST_EXCEPTION } from '../src/engine'
import type { RetrievedMemory } from '../src/api-contracts'
import type { GraphCapacityUnit, GraphPlace } from './graph-types'

type RouteRecord = {
  id: string
  label: string
  distanceM: number
  durationMin: number
  canopyAdjacentPct: number
}

const routeProfiles = [
  { code: 'B' as const, name: 'Route B · Direct', capacity: 92, share: 0.52, stepFree: false },
  { code: 'A' as const, name: 'Route A · Quieter', capacity: 78, share: 0.29, stepFree: true },
  { code: 'C' as const, name: 'Shadow Route C', capacity: 64, share: 0.19, stepFree: true },
]

export const DEFAULT_PLACES: GraphPlace[] = [
  { id: 'cdh', name: 'Cremorne Digital Hub', aliases: ['cdh', 'cremorne digital hub', '80 balmain street'] },
  { id: 'richmond', name: 'Richmond Station', aliases: ['richmond', 'richmond station'] },
  { id: 'east-richmond', name: 'East Richmond Station', aliases: ['east richmond', 'east richmond station'] },
]

export const DEFAULT_CAPACITY_UNITS: GraphCapacityUnit[] = [
  ...Object.entries(contextData.routeSets).flatMap(([destinationId, routeSet]) =>
    (routeSet as RouteRecord[]).map((route, index) => {
      const profile = routeProfiles[index]
      return {
        id: `route-${destinationId}-${profile.code.toLowerCase()}`,
        productId: route.id,
        kind: 'movement' as const,
        name: profile.name,
        placeId: 'cdh',
        destinationId,
        routeCode: profile.code,
        durationMinutes: route.durationMin,
        distanceMetres: route.distanceM,
        shadePercent: route.canopyAdjacentPct,
        directUvFactor: Number((1 - route.canopyAdjacentPct / 100 * 0.72).toFixed(3)),
        stepFree: profile.stepFree,
        safeCapacity: destinationId === 'east-richmond' ? Math.round(profile.capacity * 0.78) : profile.capacity,
        baselineDemandShare: profile.share,
        acceptedRecommendations: 0,
        facilities: profile.code === 'C' ? ['Covered passage'] : [],
        availability: ['00:00–23:59'],
      }
    }),
  ),
  ...contextData.spaces.map((space) => ({
    id: `workspace-${space.id}`,
    productId: space.id,
    kind: 'workspace' as const,
    name: space.name,
    placeId: 'cdh',
    safeCapacity: space.capacity,
    acceptedRecommendations: 0,
    facilities: space.facilities,
    stepFree: space.accessible,
    accessClass: space.accessClass as 'shared' | 'internal',
    ownerOrganisation: 'CDH',
    availability: space.availability,
  })),
]

export const DEFAULT_MEMORIES: RetrievedMemory[] = DEFAULT_CAPACITY_UNITS
  .filter((unit) => unit.routeCode === 'B')
  .map((unit) => ({
    id: FIRST_EXCEPTION.id,
    capacityUnitId: unit.id,
    requirement: 'low-uv',
    summary: 'A comparable high-UV redistribution increased direct exposure on this route.',
    effect: FIRST_EXCEPTION.exception.delta,
    confidence: FIRST_EXCEPTION.confidence,
    applies: true,
    source: 'operating-rule' as const,
  }))

export const WORKSPACE_MEMORY: RetrievedMemory = {
  id: 'boardroom-low-glare-outcome',
  capacityUnitId: 'workspace-boardroom',
  requirement: 'low-glare',
  summary: 'Previous hybrid meetings reported better visibility with the blinds and low-glare lighting in use.',
  effect: -12,
  confidence: 0.76,
  applies: true,
  source: 'outcome',
}

