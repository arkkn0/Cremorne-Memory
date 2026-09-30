import type { RecommendRequest } from '../src/api-contracts.js'
import { validateDecisionRequest } from '../server/validation.js'

export const config = { runtime: 'nodejs', maxDuration: 30 }

export async function handleDecisionRequest(request: Request) {
  try {
    if (!originAllowed(request)) return json(request, { error: 'Origin not allowed.' }, 403)
    const { listCandidateRoutes, listRouteExceptions, listWorkspaceIssues, recommend, recordOutcome, reviewCandidateRoute, reviewRouteException, reviewWorkspaceIssue } = await import('../server/decision-service.js')
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }
    if (request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > 64 * 1024) return json(request, { error: 'Request body is too large.' }, 413)
      const rawBody = await request.text()
      if (new TextEncoder().encode(rawBody).byteLength > 64 * 1024) {
        return json(request, { error: 'Request body is too large.' }, 413)
      }
      let raw: unknown
      try {
        raw = JSON.parse(rawBody)
      } catch {
        return json(request, { error: 'Request body must be valid JSON.' }, 400)
      }
      const parsed = validateDecisionRequest(raw)
      if (!parsed.success) return json(request, { error: 'Invalid decision request.', issues: parsed.issues }, 400)
      const input = parsed.data
      const response = input.action === 'recommend'
        ? await recommend(input)
        : input.action === 'outcome'
            ? await recordOutcome(input)
            : input.action === 'candidate-routes'
              ? await listCandidateRoutes(input)
              : input.action === 'candidate-route-review'
                ? await reviewCandidateRoute(input)
                : input.action === 'workspace-issues'
                  ? await listWorkspaceIssues(input)
                  : input.action === 'workspace-issue-review'
                    ? await reviewWorkspaceIssue(input)
                    : input.action === 'route-exceptions'
                      ? await listRouteExceptions(input)
                      : input.action === 'route-exception-review'
                        ? await reviewRouteException(input)
            : null
      if (!response) return json(request, { error: 'Unsupported action.' }, 400)
      return json(request, response)
    }
    if (request.method !== 'GET') return json(request, { error: 'Method not allowed.' }, 405)
    return handleLegacyGet(request, { recommend })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown backend error'
    return json(request, { error: 'Decision request failed.', detail: message }, 500)
  }
}

export default { fetch: handleDecisionRequest }

async function handleLegacyGet(request: Request, services: {
  recommend: typeof import('../server/decision-service.js')['recommend']
}) {
  const url = new URL(request.url)
  const need = url.searchParams.get('need') || 'standard'
  const memoryEnabled = url.searchParams.get('memory') === '1'
  const workers = numberParam(url, 'workers', 100, 1, 10_000)
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
  const decision = await services.recommend(recommendationRequest)
  const routeCode = (id: string) => id.endsWith('-a') ? 'A' : id.endsWith('-b') ? 'B' : 'C'
  return json(request, {
    scenario: context,
    need,
    memoryEnabled,
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

function originAllowed(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function corsHeaders(request: Request) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Vary': 'Origin',
  }
  const origin = request.headers.get('origin')
  if (origin && originAllowed(request)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(request: Request, value: unknown, status = 200) {
  return Response.json(value, { status, headers: corsHeaders(request) })
}
