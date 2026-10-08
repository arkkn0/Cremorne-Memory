import { describe, expect, it } from 'vitest'
import twinGeometry from '../src/cremorne-twin-geometry.json'

describe('Cremorne Digital Twin geometry', () => {
  it('ships a compact real OpenStreetMap street and building model', () => {
    expect(twinGeometry.source).toContain('OpenStreetMap contributors')
    expect(twinGeometry.licence).toBe('ODbL')
    expect(twinGeometry.roads.length).toBeGreaterThan(500)
    expect(twinGeometry.buildings.length).toBeGreaterThan(1000)
  })

  it('stores renderable geometry rather than presentation placeholders', () => {
    expect(twinGeometry.roads.every((way) => way.coordinates.length > 1)).toBe(true)
    expect(twinGeometry.buildings.every((way) => way.coordinates.length > 2)).toBe(true)
    expect(twinGeometry.roads.some((way) => way.kind.startsWith('railway:'))).toBe(true)
    expect(twinGeometry.roads.some((way) => way.kind.startsWith('highway:'))).toBe(true)
  })
})
