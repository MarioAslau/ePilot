import { fetchTicker, isFreshTrade } from '../../apps/api/src/coinbase.ts'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

interface LocalPlayer {
  playerId: string
  accessToken: string
  createdAt: string
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function localPlayerApi(): Plugin {
  const players = new Map<string, LocalPlayer>()

  return {
    name: 'local-player-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname

        if (request.method === 'POST' && pathname === '/api/players') {
          let playerId: string
          do {
            playerId = `anon_${randomHex(4)}`
          } while (players.has(playerId))

          const player = {
            playerId,
            accessToken: randomHex(32),
            createdAt: new Date().toISOString(),
          }
          players.set(playerId, player)
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              playerId: player.playerId,
              accessToken: player.accessToken,
            }),
          )
          return
        }

        if (request.method === 'GET' && pathname === '/api/market') {
          try {
            const quote = await fetchTicker()
            const now = new Date()
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                price: quote.price,
                source: 'COINBASE_EXCHANGE',
                fetchedAt: quote.fetchedAt,
                tradeTime: quote.tradeTime,
                isFresh: isFreshTrade(quote.tradeTime, now),
              }),
            )
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
          return
        }

        if (request.method === 'GET' && pathname === '/api/me') {
          const match =
            /^Bearer (anon_[0-9a-f]{8})\.([0-9a-f]{64})$/.exec(
              request.headers.authorization ?? '',
            )
          const player = match?.[1] ? players.get(match[1]) : undefined
          if (!player || player.accessToken !== match?.[2]) {
            response.statusCode = 401
            response.setHeader('Content-Type', 'application/json')
            response.end(
              JSON.stringify({
                code: 'UNAUTHORIZED',
                message: 'Invalid player credentials',
                requestId: 'local',
              }),
            )
            return
          }

          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify(
              {
                playerId: player.playerId,
                score: 0,
                wins: 0,
                losses: 0,
                activePrediction: null,
                latestResolvedPrediction: null,
                waitReason: null,
                serverTime: new Date().toISOString(),
              },
            ),
          )
          return
        }

        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localPlayerApi()],
  server: {
    port: 5173,
    open: true,
  },
})
