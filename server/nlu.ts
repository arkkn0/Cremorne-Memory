import type { StructuredDemand } from '../src/api-contracts'
import { llmConfigured, requestStructuredOutput } from './llm.js'

const demandSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    intent: { type: 'string', enum: ['movement', 'workspace'] },
    destination_text: { type: ['string', 'null'] },
    arrival_deadline: { type: ['string', 'null'], description: '24-hour HH:MM or null' },
    departure_flexibility_minutes: { type: 'integer' },
    start_time: { type: ['string', 'null'], description: '24-hour HH:MM or null' },
    duration_minutes: { type: 'integer' },
    capacity_required: { type: 'integer' },
    requirements: {
      type: 'object',
      additionalProperties: false,
      properties: {
        low_uv: { type: 'boolean' },
        step_free: { type: 'boolean' },
        accessible: { type: 'boolean' },
        hybrid_equipment: { type: 'boolean' },
        equipment: { type: 'array', items: { type: 'string' } },
      },
      required: ['low_uv', 'step_free', 'accessible', 'hybrid_equipment', 'equipment'],
    },
    preferences: {
      type: 'object',
      additionalProperties: false,
      properties: {
        crowding: { type: 'string', enum: ['lower', 'standard'] },
        uv: { type: 'string', enum: ['lower', 'standard'] },
      },
      required: ['crowding', 'uv'],
    },
    requirement_strength: { type: 'string', enum: ['required', 'preferred'] },
    requester_organisation: { type: ['string', 'null'] },
    confidence: { type: 'number' },
    unresolved_fields: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'intent', 'destination_text', 'arrival_deadline', 'departure_flexibility_minutes',
    'start_time', 'duration_minutes', 'capacity_required', 'requirements', 'preferences',
    'requirement_strength', 'requester_organisation', 'confidence', 'unresolved_fields',
  ],
} as const

type LlmDemand = {
  intent: 'movement' | 'workspace'
  destination_text: string | null
  arrival_deadline: string | null
  departure_flexibility_minutes: number
  start_time: string | null
  duration_minutes: number
  capacity_required: number
  requirements: { low_uv: boolean; step_free: boolean; accessible: boolean; hybrid_equipment: boolean; equipment: string[] }
  preferences: { crowding: 'lower' | 'standard'; uv: 'lower' | 'standard' }
  requirement_strength: 'required' | 'preferred'
  requester_organisation: string | null
  confidence: number
  unresolved_fields: string[]
}

export async function parseDemand(
  text: string,
  partial?: Partial<StructuredDemand>,
): Promise<{ demand: StructuredDemand; source: 'llm' | 'fallback' | 'structured' }> {
  if (partial?.intent) {
    return { demand: mergeDemand(fallbackParse(text || partial.originalText || ''), partial), source: 'structured' }
  }

  if (llmConfigured()) {
    try {
      const parsed = await requestStructuredOutput<LlmDemand>({
        name: 'cremorne_demand',
        schema: demandSchema,
        system: [
          'Extract a Cremorne movement or workspace request as JSON.',
          'Never invent a destination. Preserve the destination phrase exactly enough for a graph lookup.',
          'Use Australia/Melbourne local time and 24-hour HH:MM.',
          'If a field is absent, use null, a safe default, or list it in unresolved_fields.',
          'A phrase such as avoid, must, need or require means required. Prefer or if possible means preferred.',
        ].join(' '),
        user: text,
      })
      return { demand: normaliseLlmDemand(text, parsed), source: 'llm' }
    } catch {
      // A user request must remain usable when the provider is unavailable or the output is invalid.
    }
  }

  return { demand: fallbackParse(text), source: 'fallback' }
}

function normaliseLlmDemand(text: string, parsed: LlmDemand): StructuredDemand {
  return {
    intent: parsed.intent,
    originalText: text,
    destinationText: cleanNullable(parsed.destination_text),
    destinationId: null,
    arrivalDeadline: normaliseTime(parsed.arrival_deadline),
    departureFlexibilityMinutes: clamp(parsed.departure_flexibility_minutes, 0, 60),
    startTime: normaliseTime(parsed.start_time),
    durationMinutes: clamp(parsed.duration_minutes || 60, 15, 240),
    capacityRequired: clamp(parsed.capacity_required || 1, 1, 100),
    requirements: {
      lowUv: Boolean(parsed.requirements.low_uv),
      stepFree: Boolean(parsed.requirements.step_free),
      accessible: Boolean(parsed.requirements.accessible || parsed.requirements.step_free),
      hybridEquipment: Boolean(parsed.requirements.hybrid_equipment),
      equipment: parsed.requirements.equipment.map(normaliseEquipment).filter(Boolean),
    },
    preferences: parsed.preferences,
    requirementStrength: parsed.requirement_strength,
    requesterOrganisation: cleanNullable(parsed.requester_organisation),
    confidence: clamp(parsed.confidence, 0, 1),
    unresolvedFields: parsed.unresolved_fields,
  }
}

function fallbackParse(text: string): StructuredDemand {
  const lower = text.toLowerCase()
  const workspace = /room|workspace|meeting|boardroom|workshop/.test(lower)
  if (workspace) {
    const peopleMatch = lower.match(/(\d{1,3})[-\s]*(?:person|people|seat)/)
    const people = clamp(Number(peopleMatch?.[1] ?? 6), 1, 100)
    const startTime = extractTime(text, '14:00')
    const requireHybrid = /hybrid|video|teams|zoom|\bav\b/.test(lower)
    const requireAccessible = /accessible|step[- ]?free|wheelchair/.test(lower)
    const equipment: string[] = []
    if (/display|screen|monitor/.test(lower)) equipment.push('Display')
    if (/projector/.test(lower)) equipment.push('AV')
    if (/whiteboard/.test(lower)) equipment.push('Whiteboard')
    if (/adjustable blinds|sun control|avoid direct sun/.test(lower)) equipment.push('Adjustable blinds')
    if (/low[- ]?glare|avoid glare|glare sensitive/.test(lower)) equipment.push('Low-glare lighting')
    const durationMatch = lower.match(/(?:for\s*)?(\d{1,3})\s*(?:min|minute)/)
    const durationHours = lower.match(/(?:for\s*)?(\d+(?:\.\d+)?)\s*(?:hour|hr)/)
    const durationMinutes = durationMatch ? Number(durationMatch[1]) : durationHours ? Number(durationHours[1]) * 60 : 60
    return {
      intent: 'workspace', originalText: text, destinationText: null, destinationId: null,
      arrivalDeadline: null, departureFlexibilityMinutes: 0, startTime,
      durationMinutes: clamp(durationMinutes, 15, 240), capacityRequired: people,
      requirements: {
        lowUv: /low[- ]?uv|avoid direct sun|photosens/.test(lower),
        stepFree: requireAccessible,
        accessible: requireAccessible,
        hybridEquipment: requireHybrid,
        equipment,
      },
      preferences: { crowding: 'standard', uv: /glare|sun|low[- ]?uv/.test(lower) ? 'lower' : 'standard' },
      requirementStrength: /prefer|if possible|ideally/.test(lower) ? 'preferred' : 'required',
      requesterOrganisation: null, confidence: 0.74, unresolvedFields: [],
    }
  }

  const destination = extractDestination(text)
  const deadline = extractTime(text, '16:20')
  const flexibilityMatch = lower.match(/(?:up to|within|wait|flexible(?: by)?)\s*(\d{1,2})\s*(?:min|minute)/)
  const flexibility = clamp(Number(flexibilityMatch?.[1] ?? 0), 0, 60)
  const lowUv = /avoid (direct )?sun|minimal direct sun|minimi[sz]e (direct )?(sun|uv)|low[- ]?uv|photosens|albin|glare/.test(lower)
  const stepFree = /step[- ]?free|wheelchair|mobility/.test(lower)
  const lowerCrowding = /less crowded|lower crowd|quiet route|avoid crowd/.test(lower)
  return {
    intent: 'movement', originalText: text,
    destinationText: destination, destinationId: null,
    arrivalDeadline: deadline, departureFlexibilityMinutes: flexibility,
    startTime: null, durationMinutes: 0, capacityRequired: 1,
    requirements: {
      lowUv, stepFree,
      accessible: stepFree, hybridEquipment: false, equipment: [],
    },
    preferences: {
      crowding: lowerCrowding ? 'lower' : 'standard',
      uv: lowUv ? 'lower' : 'standard',
    },
    requirementStrength: /prefer|if possible|ideally/.test(lower) ? 'preferred' : 'required', requesterOrganisation: null,
    confidence: 0.68, unresolvedFields: destination ? [] : ['destination'],
  }
}

function mergeDemand(base: StructuredDemand, partial: Partial<StructuredDemand>): StructuredDemand {
  return {
    ...base,
    ...partial,
    requirements: { ...base.requirements, ...partial.requirements },
    preferences: { ...base.preferences, ...partial.preferences },
    originalText: partial.originalText || base.originalText,
  }
}

function extractDestination(text: string) {
  if (/east richmond/i.test(text)) return 'East Richmond'
  if (/richmond/i.test(text)) return 'Richmond'
  if (/cremorne digital hub|\bcdh\b/i.test(text)) return 'Cremorne Digital Hub'
  const match = text.match(/(?:get|go|walk|travel)\s+(?:me\s+)?to\s+(.+?)(?:\s+by\s+|\s+at\s+|[,.]|$)/i)
  return cleanNullable(match?.[1] ?? null)
}

function extractTime(text: string, fallback: string) {
  const match = text.match(/(?:by|at|around|from)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (!match) return fallback
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  const meridiem = match[3]?.toLowerCase()
  if (meridiem === 'pm' && hour < 12) hour += 12
  if (meridiem === 'am' && hour === 12) hour = 0
  return `${String(clamp(hour, 0, 23)).padStart(2, '0')}:${String(clamp(minute, 0, 59)).padStart(2, '0')}`
}

function normaliseEquipment(value: string) {
  const text = value.trim().toLowerCase()
  if (/screen|monitor|display/.test(text)) return 'Display'
  if (/whiteboard/.test(text)) return 'Whiteboard'
  if (/blind|sun control/.test(text)) return 'Adjustable blinds'
  if (/glare/.test(text)) return 'Low-glare lighting'
  if (/projector|\bav\b/.test(text)) return 'AV'
  return value.trim()
}

function normaliseTime(value: string | null) {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return value
  return `${String(clamp(Number(match[1]), 0, 23)).padStart(2, '0')}:${String(clamp(Number(match[2]), 0, 59)).padStart(2, '0')}`
}

function cleanNullable(value: string | null) {
  const cleaned = value?.trim()
  return cleaned ? cleaned : null
}

function clamp(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min
  return Math.min(max, Math.max(min, safe))
}

