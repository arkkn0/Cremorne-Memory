import { graphConfigured } from '../server/graph'
import { llmConfigured } from '../server/llm'

export const config = { runtime: 'nodejs' }

export default function handler() {
  return Response.json({
    product: 'Cremorne Memory',
    status: 'ready',
    decisionFlow: 'nlu-graph-memory-ranking-explanation-outcome',
    graph: graphConfigured() ? 'neo4j' : 'in-memory-fallback',
    nlu: llmConfigured() ? 'llm' : 'fallback-parser',
    evidence: 'public-baseline-plus-synthetic-mvp',
  })
}
