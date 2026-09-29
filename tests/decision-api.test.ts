import { describe, expect, it } from 'vitest'
import handler from '../api/decision'

describe('decision API contract', () => {
  it('returns Route B for the generic first pass', async () => {
    const response = handler(new Request('https://example.test/api/decision?need=standard'))
    const body = await response.json()

    expect(body.recommendation).toBe('B')
  })

  it('returns the controlled experiment from the shared engine', async () => {
    const response = handler(new Request('https://example.test/api/decision?workers=300&seed=42'))
    const body = await response.json()

    expect(body.experiment).toMatchObject({
      crowdingDelta: -20,
      walkingDelta: -7,
      uvDeltaLowUv: 40,
    })
    expect(body.experiment.routeLoads.A + body.experiment.routeLoads.B + body.experiment.routeLoads.C).toBe(300)
  })

  it('uses saved Memory to remove a known bad match before ranking', async () => {
    const response = handler(new Request('https://example.test/api/decision?need=low-uv&uv=8.2&crowding=82&memory=1'))
    const body = await response.json()
    const routeB = body.routes.find((route: { id: string }) => route.id === 'B')

    expect(body.recommendation).toBe('C')
    expect(routeB.eligible).toBe(false)
    expect(routeB.memoryRule).toBe('church-st-high-uv-route-b')
  })
})
