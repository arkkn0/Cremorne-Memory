import { describe, expect, it } from 'vitest'
import { evaluateProductRoutes, findSpaces, productContext } from './product'

describe('public-evidence product layer', () => {
  it('loads real Cremorne context with routes, trees and station baselines', () => {
    expect(productContext.routeSets.richmond).toHaveLength(3)
    expect(productContext.trees.length).toBeGreaterThan(100)
    expect(productContext.places.richmond.pmPeakEntries).toBe(4400)
  })

  it('retrieves the stored high-UV exception before ranking a low-UV route', () => {
    const routes = evaluateProductRoutes({
      destination: 'east-richmond',
      need: 'lower-uv',
      uvIndex: 8.2,
      workers: 65,
      memoryActive: true,
    })

    expect(routes.find((route) => route.id === 'east-richmond-1')).toMatchObject({ eligible: false })
    expect(routes.find((route) => route.recommended)?.id).not.toBe('east-richmond-1')
  })

  it('withholds step-free recommendations when accessibility evidence is unverified', () => {
    const routes = evaluateProductRoutes({
      destination: 'richmond',
      need: 'step-free',
      uvIndex: 6,
      workers: 50,
      memoryActive: false,
    })
    expect(routes.every((route) => !route.eligible)).toBe(true)
  })

  it('applies workspace capacity and facility constraints', () => {
    const results = findSpaces({ people: 6, requireHybrid: true, requireAccessible: true })
    expect(results[0]).toMatchObject({ id: 'boardroom', eligible: true })
    expect(results.find((space) => space.id === 'workshop')?.eligible).toBe(false)
  })
})
