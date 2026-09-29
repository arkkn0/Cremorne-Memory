export const config = { runtime: 'edge' }

export default function handler() {
  return Response.json({
    product: 'Cremorne Memory',
    status: 'ready',
    engine: 'capacity-graph-v1',
    evidence: 'synthetic-mvp',
  })
}
