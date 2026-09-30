import type { DecisionRequest, ExperimentRequest, RecommendRequest } from '../src/api-contracts'

export const config = { runtime: 'nodejs', maxDuration: 30 }

export async function handleDecisionRequest(request: Request) {
  try {
    const { recommend, recordOutcome, runExperiment } = await import('../server/decision-service')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }
    if (request.method === 'POST') {
      const input = await request.json() as DecisionRequest
      const response = input.action === 'recommend'
        ? await recommend(input)
        : input.action === 'experiment'
          ? await runExperiment(input)
          : input.action === 'outcome'
            ? await recordOutcome(input)
            : null
      if (!response) return json({ error: 'Unsupported action.' }, 400)
      return json(response)
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405)
    return handleLegacyGet(request, { recommend, runExperiment })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backend error'
    return json({ error: 'Decision request failed.', detail: message }, 500)
  }
}

export default { fetch: handleDecisionRequest }

async function handleLegacyGet(request: Request, services: {
  recommend: typeof import('../server/decision-service')['recommend']
  runExperiment: typeof import('../server/decision-service')['runExperiment']
}) {
  const url = new URL(request.url)
  const need = url.searchParams.get('need') || 'standard'
  const memoryEnabled = url.searchParams.get('memory') === '1'
  const workers = numberParam(url, 'workers', 300, 100, 500)
  const context = {
    uvIndex: numberParam(url, 'uv', 8.2, 0, 14),
    temperature: numberParam(url, 'temperature', 31, -10, 55),
    crowding: numberParam(url, 'crowding', 82, 0, 100),
    workers: Math.min(100, Math.max(35, Math.round(workers / 4))),
    requestedAt: new Date().toISOString(),
  }
  const brief = need === 'low-uv'
    ? 'Get me to East Richmond by 4:20pm with minimal direct sun.'
    : need === 'step-free'
      ? 'Get me to East Richmond by 4:20pm using a step-free route.'
      : 'Get me to East Richmond by 4:20pm using the fastest route.'
  const recommendationRequest: RecommendRequest = {
    action: 'recommend', brief, context, useMemory: memoryEnabled,
  }
  const experimentRequest: ExperimentRequest = {
    action: 'experiment',
    brief: `Redistribute ${workers} workers from ${url.searchParams.get('place') || 'Church Street'} over ${numberParam(url, 'horizon', 15, 5, 60)} minutes. Protect low-UV and mobility needs.`,
    context: { ...context, workers }, seed: numberParam(url, 'seed', 42, 1, 10_000),
  }
  const [decision, experiment] = await Promise.all([services.recommend(recommendationRequest), services.runExperiment(experimentRequest)])
  const routeCode = (id: string) => id.endsWith('-a') ? 'A' : id.endsWith('-b') ? 'B' : 'C'
  return json({
    scenario: context,
    need,
    memoryEnabled,
    experiment: experiment.experiment,
    candidateRule: experiment.candidateRule,
    recommendation: decision.recommendation ? routeCode(decision.recommendation.id) : null,
    parser: decision.parser,
    graph: decision.graph,
    routes: decision.options.map((option) => ({
      id: routeCode(option.id),
      capacityUnitId: option.id,
      name: option.name,
      eligible: option.eligible,
      score: option.score,
      minutes: option.durationMinutes,
      directUv: option.exposureIndex,
      shadePct: option.shadePercent,
      remainingCapacity: option.remainingCapacity,
      reasons: option.reasons,
      explanation: option.explanation,
      memoryRule: option.memory.find((memory) => memory.source === 'operating-rule')?.id ?? null,
    })),
  })
}

function numberParam(url: URL, name: string, fallback: number, min: number, max: number) {
  const raw = url.searchParams.get(name)
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  }
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders() })
}
