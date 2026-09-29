import contextData from './cremorne-context.json'

export type ProductNeed = 'lower-uv' | 'fastest' | 'step-free'
export type DestinationId = 'richmond' | 'east-richmond'

export interface ProductRoute {
  id: string
  label: string
  coordinates: [number, number][]
  distanceM: number
  durationMin: number
  canopyAdjacentPct: number
  nearbyTreeCount: number
  stepFreeEvidence: string
  geometrySource: string
}

export interface EvaluatedProductRoute extends ProductRoute {
  name: string
  eligible: boolean
  recommended: boolean
  reasons: string[]
  predictedLoad: number
  remainingCapacity: number
  capacity: number
  exposureIndex: number
  score: number
  evidenceStatus: 'public baseline + model' | 'coverage gap'
}

export interface ProductContext {
  generatedAt: string
  evidenceModel: Record<string, string[]>
  places: Record<string, {
    id: string
    name: string
    address?: string
    position: [number, number]
    weekdayEntries?: number
    normalWeekdayEntries?: number
    amPeakEntries?: number
    pmPeakEntries?: number
    period?: string
  }>
  routeSets: Record<DestinationId, ProductRoute[]>
  trees: Array<{
    id: string
    position: [number, number]
    radiusM: number
    heightM: number
    denseCanopy: boolean
  }>
  spaces: Array<{
    id: string
    name: string
    capacity: number
    standingCapacity?: number
    mode: string
    facilities: string[]
    accessible: boolean
    availability: string[]
    availabilityStatus: string
  }>
  sources: Array<{ label: string; url: string; licence: string }>
}

export const productContext = contextData as unknown as ProductContext

const routeNames = ['Route B · Direct', 'Route A · Quieter', 'Shadow Route C']

export function evaluateProductRoutes({
  destination,
  need,
  uvIndex,
  workers,
  memoryActive,
}: {
  destination: DestinationId
  need: ProductNeed
  uvIndex: number
  workers: number
  memoryActive: boolean
}): EvaluatedProductRoute[] {
  const routes = productContext.routeSets[destination]
  const capacities = destination === 'richmond' ? [92, 78, 64] : [72, 62, 58]
  const loadShares = memoryActive ? [0.34, 0.32, 0.34] : [0.52, 0.29, 0.19]

  const evaluated = routes.map((route, index) => {
    const predictedLoad = Math.round(workers * loadShares[index])
    const capacity = capacities[index]
    const remainingCapacity = capacity - predictedLoad
    const exposureIndex = Math.round(uvIndex * route.durationMin * (1 - route.canopyAdjacentPct / 100 * 0.72))
    const reasons: string[] = []
    let eligible = true

    if (need === 'step-free') {
      eligible = false
      reasons.push('Kerb and crossing accessibility is not verified in the current evidence')
    }

    if (need === 'lower-uv' && memoryActive && index === 0 && uvIndex >= 7) {
      eligible = false
      reasons.push('Memory: this direct route previously increased exposure for low-UV users')
    }

    if (remainingCapacity < 0) {
      eligible = false
      reasons.push(`Predicted arrival load exceeds the modelled safe capacity by ${Math.abs(remainingCapacity)}`)
    } else {
      reasons.push(`${remainingCapacity} places remain at predicted arrival`)
    }

    if (route.canopyAdjacentPct >= 20) reasons.push(`${route.canopyAdjacentPct}% tree-canopy-adjacent geometry`)
    if (index === 2 && destination === 'east-richmond') reasons.push('Lowest estimated UV exposure of the eligible routes')

    const timeWeight = need === 'fastest' ? 12 : 5
    const exposureWeight = need === 'lower-uv' ? 1.1 : 0.18
    const capacityPenalty = remainingCapacity < 12 ? 60 : 0
    const score = route.durationMin * timeWeight + exposureIndex * exposureWeight + capacityPenalty

    return {
      ...route,
      name: routeNames[index] ?? route.label,
      eligible,
      recommended: false,
      reasons,
      predictedLoad,
      remainingCapacity,
      capacity,
      exposureIndex,
      score,
      evidenceStatus: need === 'step-free' ? 'coverage gap' as const : 'public baseline + model' as const,
    }
  }).sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    return a.score - b.score
  })

  const firstEligible = evaluated.find((route) => route.eligible)
  return evaluated.map((route) => ({ ...route, recommended: route.id === firstEligible?.id }))
}

export function demandAtTime(destination: DestinationId, departure: string) {
  const station = productContext.places[destination]
  const [hours, minutes] = departure.split(':').map(Number)
  const minuteOfDay = hours * 60 + minutes
  const peak = station.pmPeakEntries ?? 0
  const centre = 17 * 60 + 15
  const spread = 95
  const pulse = Math.exp(-((minuteOfDay - centre) ** 2) / (2 * spread ** 2))
  return Math.max(35, Math.round(65 + peak / 36 * pulse))
}

export function findSpaces({
  people,
  requireHybrid,
  requireAccessible,
}: {
  people: number
  requireHybrid: boolean
  requireAccessible: boolean
}) {
  return productContext.spaces.map((space) => {
    const blockers: string[] = []
    if (space.capacity < people) blockers.push(`Capacity is ${space.capacity}`)
    if (requireHybrid && !space.facilities.some((facility) => ['Video call', 'AV'].includes(facility))) {
      blockers.push('Hybrid meeting equipment not listed')
    }
    if (requireAccessible && !space.accessible) blockers.push('Accessibility not verified')
    if (space.availability.length === 0) blockers.push('No owner-provided demo window')
    return { ...space, eligible: blockers.length === 0, blockers }
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.capacity - b.capacity)
}
