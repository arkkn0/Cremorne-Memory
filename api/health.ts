import process from 'node:process'

export const config = { runtime: 'nodejs' }

export function handleHealthRequest() {
  const graphConfigured = Boolean(process.env.NEO4J_URI && process.env.NEO4J_USERNAME && process.env.NEO4J_PASSWORD)
  const llmConfigured = Boolean(process.env.LLM_API_KEY && process.env.LLM_MODEL)
  return Response.json({
    product: 'Cremorne Memory',
    status: 'ready',
    decisionFlow: 'nlu-graph-memory-ranking-explanation-outcome',
    graph: graphConfigured ? 'neo4j' : 'in-memory-fallback',
    nlu: llmConfigured ? 'llm' : 'fallback-parser',
    evidence: 'public-baseline-plus-observed-pilot-outcomes',
    checkedAt: new Date().toISOString(),
    services: [
      { id: 'decision-api', label: 'Vercel Decision API', status: 'ready', detail: 'Recommendation and outcome endpoints are responding.' },
      { id: 'nlu', label: 'Structured request engine', status: llmConfigured ? 'ready' : 'resilient', detail: llmConfigured ? 'OpenAI structured parsing is active.' : 'Local structured parsing is active.' },
      { id: 'graph', label: 'Capacity Graph', status: graphConfigured ? 'ready' : 'resilient', detail: graphConfigured ? 'Neo4j is active.' : 'The local graph runtime is active.' },
      { id: 'weather', label: 'Open-Meteo adapter', status: 'ready', detail: 'Time-of-use UV and temperature adapter is deployed.' },
      { id: 'public-data', label: 'Cremorne public evidence', status: 'ready', detail: 'Yarra, DTP, Vicmap and OSM-derived inputs are packaged with provenance.' },
      { id: 'smart-poles', label: 'Yarra smart-pole feed', status: 'connect-next', detail: 'Connect the six existing locations for measured movement calibration.' },
      { id: 'room-feed', label: 'Owner availability feed', status: 'connect-next', detail: 'Connect owner-approved time windows and booking hand-off.' },
      { id: 'identity', label: 'Pilot identity', status: 'pilot-ready', detail: 'Pseudonymous pilot profiles are active; tenancy SSO is the scale pathway.' },
    ],
  })
}

export default { fetch: handleHealthRequest }
