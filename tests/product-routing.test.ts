import { describe, expect, it } from 'vitest'
import { evaluateProductRoutes, parseRouteBrief } from '../src/product'

describe('worker route matching', () => {
  it('treats minimal direct sun as a low-UV requirement before the API returns', () => {
    const brief = parseRouteBrief('Get me to East Richmond by 4:20pm with minimal direct sun.')
    const routes = evaluateProductRoutes({
      destination: brief.destination,
      need: brief.need,
      strength: brief.strength,
      uvIndex: 8,
      workers: 1_450,
    })

    expect(brief.need).toBe('lower-uv')
    expect(routes.find((route) => route.recommended)?.name).toBe('Shadow Route C')
  })
})
