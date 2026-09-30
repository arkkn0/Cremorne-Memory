import contextData from './cremorne-context.json'
import type { JourneyOutcome } from './memory'
import type { MemoryRule } from './domain'

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
  capacityEvidence: 'verified' | 'unknown'
  exposureIndex: number
  score: number
  evidenceStatus: 'public baseline + model' | 'coverage gap'
  suggestedDelayMin: number
}

export interface ProductContext {
  generatedAt: string
  evidenceModel: Record<string, string[]>
  hotspots: Array<{
    id: string
    name: string
    surveyedPedestrianMovements: number
    surveyWindow: string
    breakdown: Record<string, number>
    evidenceSource: string
  }>
  smartPoles: string[]
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

const routeNames = ['Route B · Direct', 'Route A · Alternative', 'Shadow Route C']

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
  durationMinutes: number
  requireHybrid: boolean
  requireAccessible: boolean
  requiredEquipment: string[]
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
    : /avoid (direct )?sun|low[- ]?uv|minimi[sz]e uv|photosens|albin|glare/.test(text)
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
  const durationMatch = text.match(/(?:for\s*)?(\d{1,3})\s*(?:min|minute)/)
  const durationHours = text.match(/(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:hour|hr)/)
  const durationMinutes = Math.min(240, Math.max(15, durationMatch ? Number(durationMatch[1]) : durationHours ? Number(durationHours[1]) * 60 : 60))
  const requiredEquipment: string[] = []
  if (/display|screen|monitor/.test(text)) requiredEquipment.push('Display')
  if (/projector/.test(text)) requiredEquipment.push('AV')
  if (/whiteboard/.test(text)) requiredEquipment.push('Whiteboard')
  if (/flexible (?:seating|layout)|workshop layout/.test(text)) requiredEquipment.push('Flexible seating')
  if (/adjustable blinds|sun control|avoid direct sun/.test(text)) requiredEquipment.push('Adjustable blinds')
  if (/low[- ]?glare|avoid glare|glare sensitive/.test(text)) requiredEquipment.push('Low-glare lighting')
  const timeLabel = timeMatch ? normaliseClock(Number(timeMatch[1]), Number(timeMatch[2] ?? 0), timeMatch[3]) : '14:00'
  const chips = [`${people} people`, `${timeLabel} · ${durationMinutes} min`]
  if (requireHybrid) chips.push('Hybrid equipped')
  if (requireAccessible) chips.push('Accessible')
  chips.push(...requiredEquipment)
  return { people, durationMinutes, requireHybrid, requireAccessible, requiredEquipment, timeLabel, chips }
}

export function evaluateProductRoutes({
  destination,
  need,
  strength = 'required',
  uvIndex,
  workers,
  memoryRules = [],
  personalOutcomes = [],
}: {
  destination: DestinationId
  need: ProductNeed
  strength?: ConstraintStrength
  flexibilityMin?: number
  uvIndex: number
  workers: number
  memoryRules?: MemoryRule[]
  personalOutcomes?: JourneyOutcome[]
}): EvaluatedProductRoute[] {
  const routes = productContext.routeSets[destination]
  const matchingLowUvRule = memoryRules.find((rule) =>
    rule.routeId === 'B'
    && rule.exception.functionalNeed === 'low-uv'
    && uvIndex >= rule.context.uvMin,
  )
  const evaluated = routes.map((route, index) => {
    const suggestedDelayMin = 0
    const predictedLoad = workers
    const capacity = 0
    const remainingCapacity = 0
    const exposureIndex = Math.round(uvIndex * route.durationMin)
    const personalOutcome = personalOutcomes.find((outcome) => outcome.routeId === route.id)
    const reasons: string[] = []
    let eligible = true

    if (need === 'step-free' && strength === 'required') {
      eligible = false
      reasons.push('Kerb and crossing accessibility is not verified in the current evidence')
    }

    if (need === 'lower-uv' && strength === 'required' && matchingLowUvRule && index === 0) {
      eligible = false
      reasons.push(`Memory from ${matchingLowUvRule.context.place}: this direct route increased exposure for low-UV users`)
    }

    reasons.push(`${route.durationMin} minutes from Valhalla / OpenStreetMap routing`)
    reasons.push(`${route.canopyAdjacentPct}% canopy-adjacent geometry from Vicmap trees`)
    reasons.push('Live route capacity awaits the Yarra / CDH smart-pole feed')
    if (personalOutcome) reasons.push(`Personal Memory: this route previously felt ${personalOutcome.feedback}`)
    if (personalOutcome && personalOutcome.elapsedSeconds >= 60) reasons.push(`Personal Memory: ${Math.round(personalOutcome.elapsedSeconds / 6) / 10} minutes observed last time`)

    const timeWeight = need === 'fastest' ? 12 : 5
    const canopyWeight = need === 'lower-uv' ? 0.9 : 0.08
    const preferenceMultiplier = strength === 'preferred' ? 0.72 : 1
    const feedbackAdjustment = personalOutcome?.feedback === 'better' ? -12 : personalOutcome?.feedback === 'worse' ? 35 : 0
    const observedTimeAdjustment = personalOutcome && personalOutcome.elapsedSeconds >= 60
      ? Math.max(-20, Math.min(40, (personalOutcome.elapsedSeconds / 60 - personalOutcome.predictedMinutes) * 3))
      : 0
    const score = route.durationMin * timeWeight - route.canopyAdjacentPct * canopyWeight * preferenceMultiplier + feedbackAdjustment + observedTimeAdjustment

    return {
      ...route,
      name: routeNames[index] ?? route.label,
      eligible,
      recommended: false,
      reasons,
      predictedLoad,
      remainingCapacity,
      capacity,
      capacityEvidence: 'unknown' as const,
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
  if (minuteOfDay >= 15 * 60 && minuteOfDay < 19 * 60) return station.pmPeakEntries ?? 0
  if (minuteOfDay >= 7 * 60 && minuteOfDay < 10 * 60) return station.amPeakEntries ?? 0
  return station.normalWeekdayEntries ?? station.weekdayEntries ?? 0
}

export function findSpaces({
  people,
  requireHybrid,
  requireAccessible,
  requiredEquipment = [],
  timeLabel = '14:00',
  durationMinutes = 60,
  scope = 'all',
}: {
  people: number
  requireHybrid: boolean
  requireAccessible: boolean
  requiredEquipment?: string[]
  timeLabel?: string
  durationMinutes?: number
  scope?: SpaceScope
}) {
  return productContext.spaces.filter((space) => scope === 'all' || space.accessClass === scope).map((space) => {
    const blockers: string[] = []
    if (space.capacity < people) blockers.push(`Capacity is ${space.capacity}`)
    if (requireHybrid && !space.facilities.some((facility) => ['Video call', 'Video conference', 'Hybrid presentation', 'AV'].includes(facility))) {
      blockers.push('Hybrid meeting equipment not listed')
    }
    if (requireAccessible && !space.accessible) blockers.push('Accessibility not verified')
    requiredEquipment.forEach((equipment) => {
      const matched = equipment === 'Display'
        ? space.facilities.some((facility) => ['Display', 'AV'].includes(facility))
        : equipment === 'Flexible seating'
          ? space.facilities.some((facility) => ['Flexible seating', 'Flexible layout'].includes(facility))
          : space.facilities.includes(equipment)
      if (!matched) blockers.push(`${equipment} not listed`)
    })
    if (space.availability.length === 0) blockers.push('Live owner availability is not connected yet')
    const endTime = addClockMinutes(timeLabel, durationMinutes)
    if (space.availability.length > 0 && !space.availability.some((window) => isIntervalWithinWindow(timeLabel, endTime, window))) {
      blockers.push(`Not available from ${timeLabel} to ${endTime}`)
    }
    return { ...space, eligible: blockers.length === 0, blockers }
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.capacity - b.capacity)
}

function isIntervalWithinWindow(timeLabel: string, endTime: string, window: string) {
  const [start, end] = window.split(/[–-]/).map((value) => value.trim())
  if (!start || !end) return false
  return timeLabel >= start && endTime <= end
}

function addClockMinutes(clock: string, minutes: number) {
  const [hour, minute] = clock.split(':').map(Number)
  const total = Math.min(1439, hour * 60 + minute + minutes)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
