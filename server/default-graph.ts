import contextData from '../src/cremorne-context.json' with { type: 'json' }
import type { GraphCapacityUnit, GraphPlace } from './graph-types'

type RouteRecord = {
  id: string
  label: string
  distanceM: number
  durationMin: number
  canopyAdjacentPct: number
}

const routeProfiles = [
  { code: 'B' as const, name: 'Route B · Direct' },
  { code: 'A' as const, name: 'Route A · Alternative' },
  { code: 'C' as const, name: 'Shadow Route C' },
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
        stepFree: undefined,
        safeCapacity: 0,
        capacityEvidence: 'unknown' as const,
        baselineDemandShare: 0,
        acceptedRecommendations: 0,
        facilities: [],
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
    capacityEvidence: 'verified' as const,
    acceptedRecommendations: 0,
    facilities: space.facilities,
    stepFree: space.accessible,
    accessClass: space.accessClass as 'shared' | 'internal',
    ownerOrganisation: 'CDH',
    availability: space.availability,
  })),
]


