import { describe, expect, it } from 'vitest'
import { isDistinctJourneyTrace, simulatedJourneyTrace, traceLengthMetres } from './journey-trace'

const planned: [number, number][] = [
  [-37.83036, 144.99455],
  [-37.8298, 144.9950],
  [-37.8291, 144.9957],
  [-37.8284, 144.9965],
]

describe('walked journey traces', () => {
  it('keeps an on-route trace as the same path', () => {
    expect(isDistinctJourneyTrace(planned, planned)).toBe(false)
  })

  it('detects a materially different path', () => {
    const alternative: [number, number][] = [
      [-37.83036, 144.99455],
      [-37.8306, 144.9960],
      [-37.8299, 144.9972],
      [-37.8284, 144.9965],
    ]
    expect(isDistinctJourneyTrace(alternative, planned)).toBe(true)
  })

  it('draws partial guidance and calculates a travelled length', () => {
    const partial = simulatedJourneyTrace(planned, 0.5)
    expect(partial.length).toBeGreaterThan(1)
    expect(partial.length).toBeLessThanOrEqual(planned.length)
    expect(traceLengthMetres(partial)).toBeGreaterThan(0)
  })
})
