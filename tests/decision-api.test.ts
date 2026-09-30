import { describe, expect, it } from 'vitest'
import { handleDecisionRequest as handler } from '../api/decision'

const endpoint = 'https://example.test/api/decision'

function post(body: string) {
  return handler(new Request(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  }))
}

describe('decision API contract', () => {
  it('accepts a natural-language recommendation through POST', async () => {
    const response = await handler(new Request('https://example.test/api/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'recommend',
        brief: 'Get me to East Richmond by 4:20pm and avoid direct sun.',
        context: { uvIndex: 8.2, temperature: 31, crowding: 82, workers: 65, requestedAt: '2026-09-30T16:00:00+10:00' },
        useMemory: true,
      }),
    }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ action: 'recommend', resolvedDestination: { id: 'east-richmond' }, recommendation: { name: 'Shadow Route C' } })
  })

  it('returns Route B for the generic first pass', async () => {
    const response = await handler(new Request('https://example.test/api/decision?need=standard'))
    const body = await response.json()

    expect(body.recommendation).toBe('B')
  })

  it('does not invent a precinct rule before an outcome is recorded', async () => {
    const response = await handler(new Request('https://example.test/api/decision?need=low-uv&uv=8.2&crowding=82&memory=1'))
    const body = await response.json()
    const routeB = body.routes.find((route: { id: string }) => route.id === 'B')

    expect(body.recommendation).toBe('C')
    expect(routeB.eligible).toBe(true)
    expect(routeB.memoryRule).toBeNull()
  })

  it('lists candidate routes through the shared Decision API', async () => {
    const response = await handler(new Request('https://example.test/api/decision', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'candidate-routes', status: 'candidate' }),
    }))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({ action: 'candidate-routes', graph: 'in-memory' })
    expect(Array.isArray(body.candidates)).toBe(true)
  })

  it('rejects malformed JSON before invoking a decision service', async () => {
    const response = await post('{"action":"recommend"')
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Request body must be valid JSON.' })
  })

  it('rejects invalid action fields with bounded validation errors', async () => {
    const response = await post(JSON.stringify({ action: 'candidate-routes', status: 'published', extra: true }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Invalid decision request.')
    expect(body.issues.length).toBeLessThanOrEqual(8)
  })

  it('rejects request bodies larger than 64 KB', async () => {
    const response = await post(JSON.stringify({
      action: 'recommend',
      brief: 'x'.repeat(70 * 1024),
      context: { uvIndex: 8, temperature: 30, crowding: 50, workers: 20, requestedAt: '2026-10-01T09:00:00+10:00' },
    }))

    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: 'Request body is too large.' })
  })

  it('rejects impossible journey coordinates', async () => {
    const recommendationResponse = await post(JSON.stringify({
      action: 'recommend',
      brief: 'Get me to East Richmond by 4:20pm.',
      context: { uvIndex: 8, temperature: 30, crowding: 50, workers: 20, requestedAt: '2026-10-01T09:00:00+10:00' },
    }))
    const recommendation = await recommendationResponse.json()
    const response = await post(JSON.stringify({
      action: 'outcome',
      decisionId: recommendation.decisionId,
      capacityUnitId: recommendation.recommendation.id,
      demand: recommendation.demand,
      context: { uvIndex: 8, temperature: 30, crowding: 50, workers: 20, requestedAt: '2026-10-01T09:00:00+10:00' },
      feedback: 'better',
      metrics: {},
      shareTrace: true,
      journeyTrace: [[-37.83, 144.99], [95, 145], [-37.82, 145.01]],
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Invalid decision request.' })
  })
})
