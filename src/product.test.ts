import { describe, expect, it } from 'vitest'
import { evaluateProductRoutes, findSpaces, parseRouteBrief, parseSpaceBrief, productContext } from './product'

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

  it('turns a natural journey brief into structured constraints', () => {
    expect(parseRouteBrief('Get me to East Richmond by 4:20pm. Avoid direct sun. I can wait up to 10 minutes.')).toMatchObject({
      destination: 'east-richmond',
      need: 'lower-uv',
      strength: 'required',
      flexibilityMin: 10,
      departure: '16:10',
    })
  })

  it('uses time flexibility to produce a route-and-departure action', () => {
    const routes = evaluateProductRoutes({
      destination: 'east-richmond',
      need: 'lower-crowding',
      strength: 'preferred',
      flexibilityMin: 10,
      uvIndex: 8.2,
      workers: 97,
      memoryActive: true,
    })
    expect(routes.find((route) => route.id === 'east-richmond-2')?.suggestedDelayMin).toBe(8)
  })

  it('turns a room brief into capacity requirements', () => {
    expect(parseSpaceBrief('Find an 8-person hybrid accessible room at 2pm.')).toMatchObject({
      people: 8,
      requireHybrid: true,
      requireAccessible: true,
      timeLabel: '14:00',
    })
  })

  it('keeps internal and owner-declared shared capacity distinct', () => {
    const shared = findSpaces({ people: 6, requireHybrid: true, requireAccessible: false, scope: 'shared' })
    const internal = findSpaces({ people: 6, requireHybrid: false, requireAccessible: false, scope: 'internal' })
    expect(shared.every((space) => space.accessClass === 'shared')).toBe(true)
    expect(internal.every((space) => space.accessClass === 'internal')).toBe(true)
  })
})
