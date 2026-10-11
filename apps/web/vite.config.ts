import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

type DevFault = 'drop-response' | 'provider-down'

interface LocalResult {
  statusCode: number
  body?: string
}

interface LocalApp {
  consumeFault: () => DevFault | null
  handle: (
    method: string,
    path: string,
    authorization: string | undefined,
    rawBody: string | undefined,
    fault: DevFault | null,
    query?: Record<string, string | undefined>,
  ) => Promise<LocalResult | null>
}

function readBody(request: {
  on(event: 'data' | 'end' | 'error', listener: (value?: unknown) => void): void
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = []
    request.on('data', (chunk) => {
      if (typeof chunk === 'string') chunks.push(new TextEncoder().encode(chunk))
      else if (chunk instanceof Uint8Array) chunks.push(chunk)
    })
    request.on('end', () => {
      const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const body = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.length
      }
      resolve(new TextDecoder().decode(body))
    })
    request.on('error', () => reject(new Error('Could not read the request body')))
  })
}

function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    async configureServer(server) {
      const loaded = (await server.ssrLoadModule(
        fileURLToPath(new URL('../api/src/localDev.ts', import.meta.url)),
      )) as { createLocalApp: () => LocalApp }
      const app = loaded.createLocalApp()

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const pathname = url.pathname
        if (!pathname.startsWith('/api/')) {
          next()
          return
        }

        try {
          const rawBody = request.method === 'POST' ? await readBody(request) : undefined
          const fault: DevFault | null =
            request.method === 'POST' && pathname === '/api/predictions' ? app.consumeFault() : null
          const result = await app.handle(
            request.method ?? 'GET',
            pathname,
            request.headers.authorization,
            rawBody,
            fault,
            Object.fromEntries(url.searchParams.entries()),
          )
          if (!result) {
            next()
            return
          }
          if (fault === 'drop-response') {
            request.socket?.destroy()
            return
          }
          response.statusCode = result.statusCode
          if (result.body) response.setHeader('Content-Type', 'application/json')
          response.end(result.body ?? '')
        } catch {
          response.statusCode = 503
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              code: 'PROVIDER_UNAVAILABLE',
              message: 'Price source is unavailable',
              requestId: 'local',
            }),
          )
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localApi()],
  server: {
    port: 5173,
    open: true,
  },
})
