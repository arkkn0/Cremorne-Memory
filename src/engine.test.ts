import { describe, expect, it } from 'vitest'
import { chooseRoute, evaluateRoutes, FIRST_EXCEPTION, simulateScenario } from './engine'
import type { Scenario } from './domain'

const scenario: Scenario = {
  uvIndex: 8.2,
  temperature: 31,
  crowding: 82,
  workers: 300,
  departure: '2:20 pm',
  weatherSource: 'scenario',
}

describe('Cremorne decision engine', () => {
  it('selects the fast route in a generic first pass', () => {
    expect(chooseRoute(scenario, 'standard', []).id).toBe('B')
  })

  it('retrieves the stored UV exception before ranking Mia’s options', () => {
    const routes = evaluateRoutes(scenario, 'low-uv', [FIRST_EXCEPTION])
    const routeB = routes.find((route) => route.id === 'B')

    expect(routeB?.eligible).toBe(false)
    expect(routeB?.memoryMatch?.id).toBe(FIRST_EXCEPTION.id)
    expect(routes[0].id).toBe('C')
  })

  it('replays the controlled synthetic outcome exactly for seed 42', () => {
    expect(simulateScenario(300, 42)).toMatchObject({
      crowdingDelta: -20,
      walkingDelta: -7,
      uvDeltaLowUv: 40,
      mobilityFrictionDelta: 15,
    })
  })

  it('preserves the requested worker count across route loads', () => {
    const output = simulateScenario(425, 42)
    expect(output.routeLoads.A + output.routeLoads.B + output.routeLoads.C).toBe(425)
  })
})
