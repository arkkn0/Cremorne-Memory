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
  })
}

export default { fetch: handleHealthRequest }
