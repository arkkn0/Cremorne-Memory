import contextData from './cremorne-context.json'

export type ProductNeed = 'lower-uv' | 'lower-crowding' | 'fastest' | 'step-free'
export type ConstraintStrength = 'required' | 'preferred'
export type SpaceScope = 'shared' | 'internal' | 'all'
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
  suggestedDelayMin: number
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
    accessClass: 'shared' | 'internal'
  }>
  sources: Array<{ label: string; url: string; licence: string }>
}

export const productContext = contextData as unknown as ProductContext

const routeNames = ['Route B · Direct', 'Route A · Quieter', 'Shadow Route C']

export interface ParsedRouteBrief {
  destination: DestinationId
  need: ProductNeed
  strength: ConstraintStrength
  flexibilityMin: number
  departure: string
  deadlineLabel: string
  chips: string[]
}

export interface ParsedSpaceBrief {
  people: number
  requireHybrid: boolean
  requireAccessible: boolean
  timeLabel: string
  chips: string[]
}

function normaliseClock(hour: number, minute: number, meridiem?: string) {
  let normalisedHour = hour
  if (meridiem?.toLowerCase() === 'pm' && hour < 12) normalisedHour += 12
  if (meridiem?.toLowerCase() === 'am' && hour === 12) normalisedHour = 0
  return `${String(normalisedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function subtractMinutes(clock: string, minutes: number) {
  const [hour, minute] = clock.split(':').map(Number)
  const total = (hour * 60 + minute - minutes + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export function parseRouteBrief(brief: string): ParsedRouteBrief {
  const text = brief.toLowerCase()
  const destination: DestinationId = text.includes('east richmond') ? 'east-richmond' : 'richmond'
  const need: ProductNeed = /step[- ]?free|wheelchair|mobility/.test(text)
    ? 'step-free'
    : /avoid (direct )?sun|low[- ]?uv|minimi[sz]e uv|photosens/.test(text)
      ? 'lower-uv'
      : /less crowded|lower crowd|quiet route|avoid crowd/.test(text)
        ? 'lower-crowding'
        : 'fastest'
  const strength: ConstraintStrength = /prefer|if possible|ideally/.test(text) ? 'preferred' : 'required'
  const flexibilityMatch = text.match(/(?:up to|within|wait|flexible(?: by)?)\s*(\d{1,2})\s*(?:min|minute)/)
  const flexibilityMin = Math.min(30, Number(flexibilityMatch?.[1] ?? 0))
  const timeMatch = text.match(/(?:by|at|around)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  const deadline = timeMatch ? normaliseClock(Number(timeMatch[1]), Number(timeMatch[2] ?? 0), timeMatch[3]) : '16:20'
  const departure = subtractMinutes(deadline, 10)
  const placeLabel = destination === 'east-richmond' ? 'East Richmond' : 'Richmond'
  const needLabel = need === 'lower-uv' ? 'Low UV' : need === 'step-free' ? 'Step-free' : need === 'lower-crowding' ? 'Lower crowding' : 'Fastest'
  return {
    destination,
    need,
    strength,
    flexibilityMin,
    departure,
    deadlineLabel: deadline,
    chips: [placeLabel, `By ${deadline}`, `${needLabel} · ${strength}`, flexibilityMin ? `Flexible ${flexibilityMin} min` : 'Leave now'],
  }
}

export function parseSpaceBrief(brief: string): ParsedSpaceBrief {
  const text = brief.toLowerCase()
  const peopleMatch = text.match(/(\d{1,3})[-\s]*(?:person|people|seat)/)
  const timeMatch = text.match(/(?:at|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/)
  const people = Math.min(100, Math.max(1, Number(peopleMatch?.[1] ?? 6)))
  const requireHybrid = /hybrid|video|teams|zoom|av/.test(text)
  const requireAccessible = /accessible|step[- ]?free|wheelchair/.test(text)
  const timeLabel = timeMatch ? normaliseClock(Number(timeMatch[1]), Number(timeMatch[2] ?? 0), timeMatch[3]) : '14:00'
  const chips = [`${people} people`, timeLabel]
  if (requireHybrid) chips.push('Hybrid equipped')
  if (requireAccessible) chips.push('Accessible')
  return { people, requireHybrid, requireAccessible, timeLabel, chips }
}

export function evaluateProductRoutes({
  destination,
  need,
  strength = 'required',
  flexibilityMin = 0,
  uvIndex,
  workers,
  memoryActive,
}: {
  destination: DestinationId
  need: ProductNeed
  strength?: ConstraintStrength
  flexibilityMin?: number
  uvIndex: number
  workers: number
  memoryActive: boolean
}): EvaluatedProductRoute[] {
  const routes = productContext.routeSets[destination]
  const capacities = destination === 'richmond' ? [92, 78, 64] : [72, 62, 58]
  const loadShares = memoryActive ? [0.34, 0.32, 0.34] : [0.52, 0.29, 0.19]

  const evaluated = routes.map((route, index) => {
    const basePredictedLoad = Math.round(workers * loadShares[index])
    const suggestedDelayMin = flexibilityMin >= 8 && index === 1 ? Math.min(8, flexibilityMin) : 0
    const timeShiftRelief = suggestedDelayMin ? Math.round(basePredictedLoad * 0.16) : 0
    const predictedLoad = Math.max(0, basePredictedLoad - timeShiftRelief)
    const capacity = capacities[index]
    const remainingCapacity = capacity - predictedLoad
    const exposureIndex = Math.round(uvIndex * route.durationMin * (1 - route.canopyAdjacentPct / 100 * 0.72))
    const reasons: string[] = []
    let eligible = true

    if (need === 'step-free' && strength === 'required') {
      eligible = false
      reasons.push('Kerb and crossing accessibility is not verified in the current evidence')
    }

    if (need === 'lower-uv' && strength === 'required' && memoryActive && index === 0 && uvIndex >= 7) {
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
    if (suggestedDelayMin) reasons.push(`Predicted load falls after an ${suggestedDelayMin}-minute shift`)

    const timeWeight = need === 'fastest' ? 12 : 5
    const exposureWeight = need === 'lower-uv' ? 1.1 : 0.18
    const crowdingWeight = need === 'lower-crowding' ? 1.4 : 0.15
    const preferenceMultiplier = strength === 'preferred' ? 0.72 : 1
    const capacityPenalty = remainingCapacity < 12 ? 60 : 0
    const score = route.durationMin * timeWeight + exposureIndex * exposureWeight * preferenceMultiplier + predictedLoad * crowdingWeight * preferenceMultiplier + capacityPenalty

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
      suggestedDelayMin,
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
  scope = 'all',
}: {
  people: number
  requireHybrid: boolean
  requireAccessible: boolean
  scope?: SpaceScope
}) {
  return productContext.spaces.filter((space) => scope === 'all' || space.accessClass === scope).map((space) => {
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
