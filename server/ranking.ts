import type { DecisionContext, DecisionEligibilityCheck, DecisionScoreComponent, RankedCapacityOption, StructuredDemand } from '../src/api-contracts.js'
import type { GraphCapacityUnit, GraphNeighbourhood } from './graph-types.js'

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
  const eligibilityChecks: DecisionEligibilityCheck[] = []
  let eligible = true

  if ((demand.requirements.stepFree || demand.requirements.accessible) && !capacity.stepFree) {
    eligible = false
    reasons.push('This route does not meet the requested step-free access need.')
    eligibilityChecks.push({ id: 'access', label: 'Step-free access', status: 'fail', detail: 'Step-free access is not verified for this route.' })
  } else if (demand.requirements.stepFree || demand.requirements.accessible) {
    eligibilityChecks.push({ id: 'access', label: 'Step-free access', status: 'pass', detail: 'The route meets the requested access requirement.' })
  } else {
    eligibilityChecks.push({ id: 'access', label: 'Step-free access', status: 'not-requested', detail: 'Standard pedestrian access applies.' })
  }

  const applicableRule = memories.find((memory) =>
    memory.source === 'operating-rule'
    && memory.requirement === 'low-uv'
    && demand.requirements.lowUv,
  )
  if (applicableRule && demand.requirementStrength === 'required') {
    eligible = false
    reasons.push('A comparable high-UV journey produced higher exposure on this route.')
    eligibilityChecks.push({ id: 'memory', label: 'Local Memory boundary', status: 'fail', detail: applicableRule.summary })
  } else {
    eligibilityChecks.push({
      id: 'memory', label: 'Local Memory boundary',
      status: memories.length ? 'pass' : 'unknown',
      detail: memories.length ? 'Relevant local outcomes were applied.' : 'Ready for the first reviewed local boundary.',
    })
  }

  if (capacityKnown && remainingCapacity < 0) {
    eligible = false
    reasons.push(`Predicted demand exceeds the route’s modelled capacity by ${Math.abs(remainingCapacity)}.`)
    eligibilityChecks.push({ id: 'capacity', label: 'Capacity at arrival', status: 'fail', detail: `${Math.abs(remainingCapacity)} over the modelled safe capacity.` })
  } else if (capacityKnown) {
    eligibilityChecks.push({ id: 'capacity', label: 'Capacity at arrival', status: 'pass', detail: `${remainingCapacity} places remain after expected demand.` })
  } else {
    eligibilityChecks.push({ id: 'capacity', label: 'Capacity at arrival', status: 'unknown', detail: 'Pilot sensor calibration will establish the route threshold.' })
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
  const scoreBreakdown: DecisionScoreComponent[] = [
    { id: 'time', label: 'Journey time', value: Number((durationMinutes * timeWeight).toFixed(2)), direction: 'penalty', detail: `${durationMinutes} min × ${timeWeight} time weight` },
    { id: 'demand', label: 'Expected demand', value: Number((predictedDemand * crowdingWeight).toFixed(2)), direction: 'penalty', detail: capacityKnown ? `${predictedDemand} expected users in this time band` : 'Demand is visible; sensor calibration activates the capacity weight' },
    { id: 'capacity', label: 'Capacity buffer', value: remainingPenalty, direction: 'penalty', detail: capacityKnown ? `${remainingCapacity} places remain` : 'Capacity weight activates after field calibration' },
    { id: 'memory', label: 'Local outcomes', value: Number(memoryScore.toFixed(2)), direction: memoryScore < 0 ? 'credit' : 'penalty', detail: memories.length ? `${memories.length} relevant memory record${memories.length === 1 ? '' : 's'}` : 'Ready for observed local outcomes' },
    { id: 'canopy', label: 'Canopy adjacency', value: Number(shadeCredit.toFixed(2)), direction: 'credit', detail: `${shadePercent}% of the route is next to mapped canopy` },
  ]
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
    eligibilityChecks,
    scoreBreakdown,
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
  const eligibilityChecks: DecisionEligibilityCheck[] = []
  const requestedStart = demand.startTime || '14:00'
  const requestedEnd = addMinutes(requestedStart, demand.durationMinutes)
  const matchingWindow = capacity.availability.find((window) => intervalFits(requestedStart, requestedEnd, window))

  if (capacity.safeCapacity < demand.capacityRequired) blockers.push(`Capacity is ${capacity.safeCapacity}.`)
  eligibilityChecks.push({ id: 'capacity', label: 'Capacity', status: capacity.safeCapacity >= demand.capacityRequired ? 'pass' : 'fail', detail: `${capacity.safeCapacity} seats for ${demand.capacityRequired} people.` })
  if (demand.requirements.accessible && !capacity.stepFree) blockers.push('Accessibility is not verified.')
  eligibilityChecks.push({ id: 'accessibility', label: 'Accessibility', status: demand.requirements.accessible ? capacity.stepFree ? 'pass' : 'fail' : 'not-requested', detail: demand.requirements.accessible ? capacity.stepFree ? 'Step-free access is verified.' : 'Access verification required.' : 'Standard room access applies.' })
  const hybridAvailable = hasAny(capacity.facilities, ['Video call', 'Video conference', 'Hybrid presentation', 'AV'])
  if (demand.requirements.hybridEquipment && !hybridAvailable) blockers.push('Hybrid meeting equipment is not listed.')
  eligibilityChecks.push({ id: 'hybrid', label: 'Hybrid equipment', status: demand.requirements.hybridEquipment ? hybridAvailable ? 'pass' : 'fail' : 'not-requested', detail: demand.requirements.hybridEquipment ? hybridAvailable ? 'Hybrid capability is listed.' : 'Hybrid capability verification required.' : 'Standard meeting setup applies.' })
  demand.requirements.equipment.forEach((equipment) => {
    const matches = facilityMatches(capacity.facilities, equipment)
    if (!matches) blockers.push(`${equipment} is not confirmed in venue data.`)
    eligibilityChecks.push({ id: `equipment-${equipment.toLowerCase().replace(/\s+/g, '-')}`, label: equipment, status: matches ? 'pass' : 'fail', detail: matches ? `${equipment} is confirmed in venue data.` : `${equipment} is not confirmed in venue data.` })
  })
  if (!matchingWindow) blockers.push(`The room is not available from ${requestedStart} to ${requestedEnd}.`)
  eligibilityChecks.push({ id: 'time', label: 'Time window', status: matchingWindow ? 'pass' : 'fail', detail: matchingWindow ? `Available ${requestedStart}–${requestedEnd}.` : `No owner-open window covers ${requestedStart}–${requestedEnd}.` })
  const accessAllowed = capacity.accessClass !== 'internal' || capacity.ownerOrganisation === demand.requesterOrganisation
  if (!accessAllowed) blockers.push('This room is internal to another organisation.')
  eligibilityChecks.push({ id: 'tenancy', label: 'Tenancy access', status: accessAllowed ? 'pass' : 'fail', detail: accessAllowed ? `${capacity.accessClass === 'internal' ? 'Requester belongs to the owning organisation.' : 'Shared access is permitted in the owner-open window.'}` : 'The requester is outside the owning organisation.' })

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
  const scoreBreakdown: DecisionScoreComponent[] = [
    { id: 'requirements', label: 'Required conditions', value: blockers.length * 1_000, direction: 'penalty', detail: blockers.length ? `${blockers.length} required condition${blockers.length === 1 ? '' : 's'} not met` : 'All required conditions pass' },
    { id: 'fit', label: 'Capacity fit', value: Number(sparePenalty.toFixed(2)), direction: 'penalty', detail: `${remainingCapacity} seats remain after booking` },
    { id: 'memory', label: 'Previous outcomes', value: Number(memoryScore.toFixed(2)), direction: memoryScore < 0 ? 'credit' : 'penalty', detail: memories.length ? `${memories.length} relevant memory record${memories.length === 1 ? '' : 's'}` : 'Ready for observed local outcomes' },
  ]
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
    eligibilityChecks,
    scoreBreakdown,
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

