import { buildCdhOperationsModel } from '../src/cdh-operations.js'

export const config = { runtime: 'nodejs' }

export function handleOperationsRequest(request: Request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  return Response.json(buildCdhOperationsModel(), {
    headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}

export default { fetch: handleOperationsRequest }
