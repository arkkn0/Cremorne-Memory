import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseDemand } from '../server/nlu'

const originalKey = process.env.LLM_API_KEY
const originalModel = process.env.LLM_MODEL

afterEach(() => {
  process.env.LLM_API_KEY = originalKey
  process.env.LLM_MODEL = originalModel
  vi.restoreAllMocks()
})

describe('natural-language understanding', () => {
  it('uses structured LLM output when a provider is configured', async () => {
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_MODEL = 'test-model'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      intent: 'movement', destination_text: 'Building X', arrival_deadline: '14:30', departure_flexibility_minutes: 10,
      start_time: null, duration_minutes: 0, capacity_required: 1,
      requirements: { low_uv: true, step_free: false, accessible: false, hybrid_equipment: false, equipment: [] },
      preferences: { crowding: 'lower', uv: 'lower' }, requirement_strength: 'required',
      requester_organisation: null, confidence: 0.96, unresolved_fields: [],
    }) } }] }), { status: 200, headers: { 'content-type': 'application/json' } })))

    const parsed = await parseDemand('Get me to Building X by 2:30 and avoid direct sunlight.')
    expect(parsed.source).toBe('llm')
    expect(parsed.demand).toMatchObject({ destinationText: 'Building X', arrivalDeadline: '14:30', requirements: { lowUv: true } })
  })

  it('falls back cleanly when no LLM is configured', async () => {
    delete process.env.LLM_API_KEY
    delete process.env.LLM_MODEL
    const parsed = await parseDemand('I need a room for six people at 2pm for 45 minutes with hybrid equipment.')
    expect(parsed.source).toBe('fallback')
    expect(parsed.demand).toMatchObject({ intent: 'workspace', capacityRequired: 6, startTime: '14:00', durationMinutes: 45 })
  })
})
