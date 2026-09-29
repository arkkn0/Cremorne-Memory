import { describe, expect, it } from 'vitest'
import { evaluateProductRoutes, findSpaces, parseExperimentBrief, parseRouteBrief, parseSpaceBrief, productContext } from './product'
import { FIRST_EXCEPTION } from './engine'

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
      memoryRules: [FIRST_EXCEPTION],
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
      memoryRules: [],
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
      memoryRules: [FIRST_EXCEPTION],
    })
    expect(routes.find((route) => route.id === 'east-richmond-2')?.suggestedDelayMin).toBe(8)
  })

  it('feeds a worker outcome back into the next route ranking', () => {
    const input = { destination: 'east-richmond' as const, need: 'lower-crowding' as const, strength: 'preferred' as const, flexibilityMin: 10, uvIndex: 8.2, workers: 97, memoryRules: [FIRST_EXCEPTION] }
    const baseline = evaluateProductRoutes(input)
    const route = baseline.find((option) => option.eligible)!
    const withFeedback = evaluateProductRoutes({ ...input, personalOutcomes: [{ routeId: route.id, routeName: route.name, completedAt: new Date().toISOString(), elapsedSeconds: 20, predictedMinutes: route.durationMin, exposureIndex: route.exposureIndex, feedback: 'worse' }] })
    expect(withFeedback.find((option) => option.id === route.id)?.score).toBeGreaterThan(route.score)
    expect(withFeedback.find((option) => option.id === route.id)?.reasons.join(' ')).toContain('Personal Memory')
  })

  it('turns a room brief into capacity requirements', () => {
    expect(parseSpaceBrief('Find an 8-person hybrid accessible room with a display at 2pm.')).toMatchObject({
      people: 8,
      requireHybrid: true,
      requireAccessible: true,
      requiredEquipment: ['Display'],
      timeLabel: '14:00',
    })
  })

  it('uses requested time and equipment when checking room eligibility', () => {
    const matching = findSpaces({ people: 6, requireHybrid: true, requireAccessible: true, requiredEquipment: ['Display'], timeLabel: '14:00' })
    const outsideWindow = findSpaces({ people: 6, requireHybrid: true, requireAccessible: true, requiredEquipment: ['Display'], timeLabel: '15:30' })
    expect(matching.find((space) => space.id === 'boardroom')?.eligible).toBe(true)
    expect(outsideWindow.find((space) => space.id === 'boardroom')?.eligible).toBe(false)
  })

  it('turns an operator experiment brief into a measurable test', () => {
    expect(parseExperimentBrief('Redistribute 320 workers from Church Street over 20 minutes. Protect low-UV and mobility needs.')).toMatchObject({
      workers: 320,
      horizonMin: 20,
      place: 'Church Street',
      protectLowUv: true,
      protectMobility: true,
    })
  })

  it('keeps internal and owner-declared shared capacity distinct', () => {
    const shared = findSpaces({ people: 6, requireHybrid: true, requireAccessible: false, scope: 'shared' })
    const internal = findSpaces({ people: 6, requireHybrid: false, requireAccessible: false, scope: 'internal' })
    expect(shared.every((space) => space.accessClass === 'shared')).toBe(true)
    expect(internal.every((space) => space.accessClass === 'internal')).toBe(true)
  })
})
