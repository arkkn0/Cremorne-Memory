import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { handleDecisionRequest } from './api/decision'
import { handleHealthRequest } from './api/health'

function localApi(): Plugin {
  return {
    name: 'cremorne-local-api',
    configureServer(server) {
      const mount = (path: string, handler: (request: Request) => Response | Promise<Response>) => {
        server.middlewares.use(path, async (req, res) => {
          try {
            const chunks: Buffer[] = []
            for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : undefined
            const request = new Request(`http://localhost${path}${req.url === '/' ? '' : req.url}`, {
              method: req.method,
              headers: req.headers as Record<string, string>,
              body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
            })
            const response = await handler(request)
            res.statusCode = response.status
            response.headers.forEach((value, key) => res.setHeader(key, value))
            res.end(Buffer.from(await response.arrayBuffer()))
          } catch (error) {
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Local API failed' }))
          }
        })
      }
      mount('/api/decision', handleDecisionRequest)
      mount('/api/health', handleHealthRequest)
    },
  }
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return {
    plugins: [react(), localApi()],
    server: { port: 4173 },
  }
})
