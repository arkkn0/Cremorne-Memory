import { describe, expect, it } from 'vitest'
import handler from './decision'

describe('decision API', () => {
  it('returns Route B for the generic first pass', async () => {
    const response = handler(new Request('https://example.test/api/decision?need=standard'))
    const body = await response.json()
    expect(body.recommendation).toBe('B')
  })

  it('returns Shadow Route C when Mia’s need and Memory are present', async () => {
    const response = handler(new Request('https://example.test/api/decision?need=low-uv&memory=1'))
    const body = await response.json()
    expect(body.recommendation).toBe('C')
    expect(body.routes.find((route: { id: string }) => route.id === 'B')).toMatchObject({
      eligible: false,
      memoryRule: 'church-st-high-uv-route-b',
    })
  })
})
