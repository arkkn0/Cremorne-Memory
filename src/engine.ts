import type {
  FunctionalNeed,
  MemoryRule,
  RouteEvaluation,
  RouteId,
  RouteOption,
  Scenario,
  SimulationResult,
} from './domain'

export const ROUTES: RouteOption[] = [
  {
    id: 'A',
    name: 'Accessible Route A',
    descriptor: 'Step-free crossing · wider footpath',
    minutes: 9,
    distanceM: 720,
    shadePct: 46,
    directUv: 4.9,
    capacity: 155,
    predictedLoad: 72,
    stepFree: true,
    path: 'M86 342 C148 318 205 300 260 250 C316 200 375 184 468 148 C540 120 598 88 680 72',
    color: '#496e9c',
  },
  {
    id: 'B',
    name: 'Fast Route B',
    descriptor: 'Direct via Church Street',
    minutes: 7,
    distanceM: 590,
    shadePct: 18,
    directUv: 7.8,
    capacity: 145,
    predictedLoad: 91,
    stepFree: false,
    path: 'M86 342 C172 330 250 307 320 270 C398 228 492 204 574 154 C624 124 652 96 680 72',
    color: '#f05a3f',
  },
  {
    id: 'C',
    name: 'Shadow Route C',
    descriptor: 'Arcade + participating lobby',
    minutes: 8,
    distanceM: 650,
    shadePct: 82,
    directUv: 2.1,
    capacity: 105,
    predictedLoad: 48,
    stepFree: true,
    participatingAsset: 'Cubitt St Arcade · access until 18:00',
    path: 'M86 342 C126 292 172 266 228 268 L282 268 C332 264 353 214 408 202 L492 202 C548 188 606 126 680 72',
    color: '#2a8a72',
  },
]

export const FIRST_EXCEPTION: MemoryRule = {
  id: 'church-st-high-uv-route-b',
  createdAt: new Date('2026-09-30T14:20:00+10:00').toISOString(),
  context: { uvMin: 7, crowdingMin: 72, place: 'Church Street' },
  routeId: 'B',
  outcome: { crowdingDelta: -20, walkingDelta: -7 },
  exception: { functionalNeed: 'low-uv', metric: 'direct UV exposure', delta: 40 },
  confidence: 0.82,
  deploymentBoundary: 'Do not recommend to low-UV users when UV ≥ 7.',
}

const seedNoise = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function simulateScenario(workers = 300, seed = 42): SimulationResult {
  const wobble = seed === 42 ? 0 : Math.round((seedNoise(seed) - 0.45) * 2)
  const bLoad = Math.round(workers * 0.62)
  const aLoad = Math.round(workers * 0.2)
  const cLoad = workers - bLoad - aLoad

  return {
    crowdingDelta: -20 + wobble,
    walkingDelta: -7,
    uvDeltaLowUv: 40 + wobble,
    mobilityFrictionDelta: 15,
    routeLoads: { A: aLoad, B: bLoad, C: cLoad },
  }
}

function retrieveRule(route: RouteOption, scenario: Scenario, rules: MemoryRule[]) {
  return rules.find(
    (rule) =>
      rule.routeId === route.id &&
      scenario.uvIndex >= rule.context.uvMin &&
      scenario.crowding >= rule.context.crowdingMin,
  )
}

export function evaluateRoutes(
  scenario: Scenario,
  need: FunctionalNeed,
  rules: MemoryRule[],
): RouteEvaluation[] {
  return ROUTES.map((route) => {
    const reasons: string[] = []
    const memoryMatch = retrieveRule(route, scenario, rules)
    let eligible = true

    if (need === 'step-free' && !route.stepFree) {
      eligible = false
      reasons.push('Steps create a hard access conflict')
    }

    if (need === 'low-uv' && route.directUv > 5) {
      eligible = false
      reasons.push('Predicted direct UV exceeds your limit')
    }

    if (memoryMatch?.exception.functionalNeed === need) {
      eligible = false
      reasons.push('A comparable local outcome is stored in Memory')
    }

    const spareCapacity = Math.max(0, route.capacity - route.predictedLoad)
    if (spareCapacity < 18) {
      reasons.push('Little capacity remains at arrival time')
    }

    const timeScore = route.minutes * 7
    const crowdScore = (route.predictedLoad / route.capacity) * 22
    const uvWeight = need === 'low-uv' ? 9 : 0.3
    const uvScore = route.directUv * uvWeight
    const shadeCredit = route.shadePct * (need === 'low-uv' ? 0.16 : 0)
    const memoryPenalty = memoryMatch && need !== 'standard' ? 80 : 0
    const score = timeScore + crowdScore + uvScore + memoryPenalty - shadeCredit

    if (eligible && spareCapacity >= 18) reasons.push(`${spareCapacity} places remain at predicted arrival`)
    if (eligible && route.shadePct >= 70) reasons.push(`${route.shadePct}% of this route is covered or shaded`)

    return { ...route, eligible, score, reasons, memoryMatch }
  }).sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
    return a.score - b.score
  })
}

export function chooseRoute(
  scenario: Scenario,
  need: FunctionalNeed,
  rules: MemoryRule[],
): RouteEvaluation {
  return evaluateRoutes(scenario, need, rules)[0]
}

export function distributeWithMemory(workers: number): Record<RouteId, number> {
  const routeC = Math.round(workers * 0.34)
  const routeA = Math.round(workers * 0.3)
  return { A: routeA, B: workers - routeA - routeC, C: routeC }
}
