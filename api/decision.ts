import type { FunctionalNeed, Scenario } from '../src/domain'
import { evaluateRoutes, FIRST_EXCEPTION, simulateScenario } from '../src/engine'

export const config = { runtime: 'edge' }

const allowedNeeds: FunctionalNeed[] = ['standard', 'low-uv', 'step-free']

export default function handler(request: Request) {
  const url = new URL(request.url)
  const requestedNeed = url.searchParams.get('need') as FunctionalNeed | null
  const need = requestedNeed && allowedNeeds.includes(requestedNeed) ? requestedNeed : 'standard'
  const memoryEnabled = url.searchParams.get('memory') === '1'
  const seed = numberParam(url, 'seed', 42, 1, 10_000)

  const scenario: Scenario = {
    uvIndex: numberParam(url, 'uv', 8.2, 0, 14),
    temperature: numberParam(url, 'temperature', 31, -10, 55),
    crowding: numberParam(url, 'crowding', 82, 0, 100),
    workers: numberParam(url, 'workers', 300, 100, 500),
    departure: url.searchParams.get('departure') ?? '2:20 pm',
    weatherSource: 'scenario',
  }

  const rules = memoryEnabled ? [FIRST_EXCEPTION] : []
  const routes = evaluateRoutes(scenario, need, rules)

  return Response.json({
    scenario,
    need,
    memoryEnabled,
    experiment: simulateScenario(scenario.workers, seed),
    recommendation: routes.find((route) => route.eligible)?.id ?? null,
    routes: routes.map((route) => ({
      id: route.id,
      name: route.name,
      eligible: route.eligible,
      score: Number(route.score.toFixed(2)),
      minutes: route.minutes,
      directUv: route.directUv,
      shadePct: route.shadePct,
      remainingCapacity: route.capacity - route.predictedLoad,
      reasons: route.reasons,
      memoryRule: route.memoryMatch?.id ?? null,
    })),
  })
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const raw = url.searchParams.get(name)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}
