import { describe, expect, it } from 'vitest'
import handler from '../api/decision'
import { evaluateProductRoutes } from '../src/product'

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

  it('returns the controlled experiment from the shared engine', async () => {
    const response = await handler(new Request('https://example.test/api/decision?workers=300&seed=42'))
    const body = await response.json()

    expect(body.experiment).toMatchObject({
      crowdingDelta: -20,
      walkingDelta: -7,
      uvDeltaLowUv: 40,
    })
    expect(body.experiment.baselineLoads.A + body.experiment.baselineLoads.B + body.experiment.baselineLoads.C).toBe(300)
    expect(body.experiment.interventionLoads.A + body.experiment.interventionLoads.B + body.experiment.interventionLoads.C).toBe(300)
    expect(body.candidateRule).toMatchObject({
      context: { place: 'Church Street', uvMin: 8 },
      exception: { functionalNeed: 'low-uv', delta: 40 },
    })
  })

  it('feeds the API candidate rule into the next worker ranking', async () => {
    const response = await handler(new Request('https://example.test/api/decision?workers=300&seed=42&uv=8.2&crowding=92&place=Church%20Street'))
    const body = await response.json()
    const routes = evaluateProductRoutes({
      destination: 'east-richmond',
      need: 'lower-uv',
      uvIndex: 8.2,
      workers: 65,
      memoryRules: [body.candidateRule],
    })

    expect(routes.find((route) => route.id === 'east-richmond-1')?.eligible).toBe(false)
    expect(routes.find((route) => route.recommended)?.id).toBe('east-richmond-3')
  })

  it('uses saved Memory to remove a known bad match before ranking', async () => {
    const response = await handler(new Request('https://example.test/api/decision?need=low-uv&uv=8.2&crowding=82&memory=1'))
    const body = await response.json()
    const routeB = body.routes.find((route: { id: string }) => route.id === 'B')

    expect(body.recommendation).toBe('C')
    expect(routeB.eligible).toBe(false)
    expect(routeB.memoryRule).toBe('church-st-high-uv-route-b')
  })
})
