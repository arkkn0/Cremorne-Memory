import type { DecisionContext, RankedCapacityOption, StructuredDemand } from '../src/api-contracts'
import type { GraphCapacityUnit, GraphNeighbourhood } from './graph-types'

export function rankCapacity(
  demand: StructuredDemand,
  context: DecisionContext,
  neighbourhood: GraphNeighbourhood,
): RankedCapacityOption[] {
  const ranked = neighbourhood.candidates.map((capacity) => demand.intent === 'movement'
    ? rankMovement(capacity, demand, context, neighbourhood)
    : rankWorkspace(capacity, demand, neighbourhood))
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1
      return left.score - right.score
    })

  const firstEligible = ranked.find((option) => option.eligible)
  return ranked.map((option) => ({ ...option, recommended: option.id === firstEligible?.id }))
}

function rankMovement(
  capacity: GraphCapacityUnit,
  demand: StructuredDemand,
  context: DecisionContext,
  neighbourhood: GraphNeighbourhood,
): RankedCapacityOption {
  const memories = neighbourhood.memories.filter((memory) => memory.capacityUnitId === capacity.id && memory.applies)
  const delayMinutes = demand.departureFlexibilityMinutes >= 8 && capacity.routeCode === 'A'
    ? Math.min(8, demand.departureFlexibilityMinutes)
    : 0
  const capacityKnown = capacity.capacityEvidence === 'verified'
  const baseDemand = capacityKnown ? Math.round(context.workers * (capacity.baselineDemandShare ?? 0)) : 0
  const timeShiftRelief = delayMinutes ? Math.round(baseDemand * 0.16) : 0
  const predictedDemand = Math.max(0, baseDemand - timeShiftRelief)
  const accepted = capacity.acceptedRecommendations + (context.acceptedRecommendations?.[capacity.id] ?? 0)
  const remainingCapacity = capacityKnown ? capacity.safeCapacity - predictedDemand - accepted : 0
  const durationMinutes = capacity.durationMinutes ?? 10
  const shadePercent = capacity.shadePercent ?? 0
  const exposureIndex = Math.round(context.uvIndex * durationMinutes * (1 - shadePercent / 100))
  const reasons: string[] = []
  let eligible = true

  if ((demand.requirements.stepFree || demand.requirements.accessible) && !capacity.stepFree) {
    eligible = false
    reasons.push('This route does not meet the requested step-free access need.')
  }

  const applicableRule = memories.find((memory) =>
    memory.source === 'operating-rule'
    && memory.requirement === 'low-uv'
    && demand.requirements.lowUv,
  )
  if (applicableRule && demand.requirementStrength === 'required') {
    eligible = false
    reasons.push('A comparable high-UV journey produced higher exposure on this route.')
  }

  if (capacityKnown && remainingCapacity < 0) {
    eligible = false
    reasons.push(`Predicted demand exceeds the route’s modelled capacity by ${Math.abs(remainingCapacity)}.`)
  }

  if (capacityKnown && eligible) reasons.push(`${remainingCapacity} places remain at the expected arrival time.`)
  reasons.push(`${durationMinutes} minutes to your destination.`)
  if (shadePercent > 0) reasons.push(`${shadePercent}% of the route is next to mapped canopy.`)
  memories.slice(0, 1).forEach((memory) => reasons.push(memory.summary))

  const prioritisesLowerUv = demand.requirements.lowUv || demand.preferences.uv === 'lower'
  const timeWeight = prioritisesLowerUv || demand.preferences.crowding === 'lower' ? 5 : 10
  const crowdingWeight = capacityKnown && demand.preferences.crowding === 'lower' ? 1.45 : 0
  const exposureWeight = 0
  const remainingPenalty = capacityKnown ? (remainingCapacity < 12 ? 70 : remainingCapacity < 24 ? 18 : 0) : 0
  const memoryScore = memories.reduce((total, memory) => total + memory.effect * memory.confidence, 0)
  const shadeCredit = prioritisesLowerUv ? shadePercent * 0.9 : 0
  const score = durationMinutes * timeWeight
    + predictedDemand * crowdingWeight
    + exposureIndex * exposureWeight
    + remainingPenalty
    + memoryScore
    - shadeCredit

  return {
    id: capacity.id,
    productId: capacity.productId,
    kind: 'movement',
    name: capacity.name,
    eligible,
    recommended: false,
    score: Number(score.toFixed(2)),
    reasons,
    explanation: '',
    durationMinutes,
    suggestedDelayMinutes: delayMinutes,
    predictedDemand,
    safeCapacity: capacity.safeCapacity,
    remainingCapacity,
    capacityEvidence: capacity.capacityEvidence,
    shadePercent,
    exposureIndex,
    stepFree: capacity.stepFree,
    facilities: capacity.facilities,
    memory: memories,
  }
}

function rankWorkspace(
  capacity: GraphCapacityUnit,
  demand: StructuredDemand,
  neighbourhood: GraphNeighbourhood,
): RankedCapacityOption {
  const memories = neighbourhood.memories.filter((memory) => memory.capacityUnitId === capacity.id && memory.applies)
  const reasons: string[] = []
  const blockers: string[] = []
  const requestedStart = demand.startTime || '14:00'
  const requestedEnd = addMinutes(requestedStart, demand.durationMinutes)
  const matchingWindow = capacity.availability.find((window) => intervalFits(requestedStart, requestedEnd, window))

  if (capacity.safeCapacity < demand.capacityRequired) blockers.push(`Capacity is ${capacity.safeCapacity}.`)
  if (demand.requirements.accessible && !capacity.stepFree) blockers.push('Accessibility is not verified.')
  if (demand.requirements.hybridEquipment && !hasAny(capacity.facilities, ['Video call', 'Video conference', 'Hybrid presentation', 'AV'])) blockers.push('Hybrid meeting equipment is not listed.')
  demand.requirements.equipment.forEach((equipment) => {
    if (!facilityMatches(capacity.facilities, equipment)) blockers.push(`${equipment} is not listed.`)
  })
  if (!matchingWindow) blockers.push(`The room is not available from ${requestedStart} to ${requestedEnd}.`)
  if (capacity.accessClass === 'internal' && capacity.ownerOrganisation !== demand.requesterOrganisation) blockers.push('This room is internal to another organisation.')

  const remainingCapacity = capacity.safeCapacity - demand.capacityRequired
  if (blockers.length === 0) {
    reasons.push(`Fits ${demand.capacityRequired} people from ${requestedStart} to ${requestedEnd}.`)
    const matchedFacilities = capacity.facilities.filter((facility) =>
      demand.requirements.equipment.some((required) => facilityMatches([facility], required))
      || (demand.requirements.hybridEquipment && ['Video call', 'Video conference', 'Hybrid presentation', 'AV'].includes(facility)))
    if (matchedFacilities.length) reasons.push(`Includes ${matchedFacilities.join(', ')}.`)
    memories.slice(0, 1).forEach((memory) => reasons.push(memory.summary))
  }

  const memoryScore = memories.reduce((total, memory) => total + memory.effect * memory.confidence, 0)
  const sparePenalty = Math.abs(remainingCapacity - 3) * 0.8
  const score = blockers.length * 1_000 + sparePenalty + memoryScore

  return {
    id: capacity.id,
    productId: capacity.productId,
    kind: 'workspace',
    name: capacity.name,
    eligible: blockers.length === 0,
    recommended: false,
    score: Number(score.toFixed(2)),
    reasons: blockers.length ? blockers : reasons,
    explanation: '',
    safeCapacity: capacity.safeCapacity,
    remainingCapacity,
    facilities: capacity.facilities,
    stepFree: capacity.stepFree,
    accessClass: capacity.accessClass,
    availability: capacity.availability,
    availableFrom: requestedStart,
    availableUntil: requestedEnd,
    memory: memories,
  }
}

function facilityMatches(facilities: string[], required: string) {
  if (required === 'Display') return hasAny(facilities, ['Display', 'AV'])
  if (required === 'Flexible seating') return hasAny(facilities, ['Flexible seating', 'Flexible layout'])
  return facilities.includes(required)
}

function hasAny(values: string[], expected: string[]) {
  return expected.some((value) => values.includes(value))
}

function intervalFits(start: string, end: string, window: string) {
  const [windowStart, windowEnd] = window.split(/[–-]/).map((value) => value.trim())
  return Boolean(windowStart && windowEnd && start >= windowStart && end <= windowEnd)
}

function addMinutes(clock: string, minutes: number) {
  const [hour, minute] = clock.split(':').map(Number)
  const total = Math.max(0, Math.min(24 * 60 - 1, hour * 60 + minute + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

