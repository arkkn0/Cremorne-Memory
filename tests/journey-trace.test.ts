import { describe, expect, it } from 'vitest'
import { distanceToPolyline, isDistinctJourneyTrace, traceLengthMetres } from '../src/journey-trace.js'
import { productContext } from '../src/product.js'

const routes = productContext.routeSets['east-richmond']
const direct = routes[0].coordinates
const canopy = routes[2].coordinates

describe('journey trace discovery', () => {
  it('does not treat the selected route as a newly discovered path', () => {
    expect(isDistinctJourneyTrace(canopy, canopy)).toBe(false)
  })

  it('detects a genuinely different recorded route shape', () => {
    expect(isDistinctJourneyTrace(direct, canopy)).toBe(true)
  })

  it('waits for at least three GPS points before proposing a route', () => {
    expect(isDistinctJourneyTrace(direct.slice(0, 2), canopy)).toBe(false)
  })

  it('measures recorded distance and proximity in metres', () => {
    expect(traceLengthMetres(canopy)).toBeGreaterThan(600)
    expect(distanceToPolyline(canopy[4], canopy)).toBe(0)
    const midpoint: [number, number] = [
      (canopy[4][0] + canopy[5][0]) / 2,
      (canopy[4][1] + canopy[5][1]) / 2,
    ]
    expect(distanceToPolyline(midpoint, canopy)).toBeLessThan(0.1)
  })
})
