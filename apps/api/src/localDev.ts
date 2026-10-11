import { fetchTicker, ProviderUnavailableError } from './coinbase.js'
import { handleCreatePlayer } from './handlers/createPlayer.js'
import { handleCreatePrediction } from './handlers/createPrediction.js'
import { handleMarket } from './handlers/market.js'
import { handleMe } from './handlers/me.js'
import { memoryGameStore } from './memoryStore.js'

export type DevFault = 'drop-response' | 'provider-down'

/**
 * In-memory game used only by the Vite dev server.
 * The fault switch is not registered on API Gateway.
 */
export function createLocalApp() {
  const store = memoryGameStore()
  let nextFault: DevFault | null = null

  return {
    arm(mode: DevFault) {
      nextFault = mode
    },

    consumeFault(): DevFault | null {
      const fault = nextFault
      nextFault = null
      return fault
    },

    async handle(
      method: string,
      path: string,
      authorization: string | undefined,
      rawBody: string | undefined,
      fault: DevFault | null = null,
    ) {
      if (method === 'POST' && path === '/api/__dev/next-prediction') {
        let mode: string | undefined
        try {
          mode = (JSON.parse(rawBody || '{}') as { mode?: string }).mode
        } catch {
          mode = undefined
        }
        if (mode === 'drop-response' || mode === 'provider-down') {
          nextFault = mode
          return { statusCode: 204, body: '' }
        }
        return {
          statusCode: 400,
          body: JSON.stringify({
            code: 'INVALID_INPUT',
            message: 'Invalid prediction request',
            requestId: 'local',
          }),
        }
      }

      if (method === 'POST' && path === '/api/players') {
        return handleCreatePlayer('local', { store })
      }
      if (method === 'GET' && path === '/api/me') {
        return handleMe(authorization, 'local', { store, predictions: store })
      }
      if (method === 'GET' && path === '/api/market') {
        return handleMarket('local')
      }
      if (method === 'POST' && path === '/api/predictions') {
        return handleCreatePrediction(authorization, rawBody, 'local', {
          players: store,
          predictions: store,
          quote:
            fault === 'provider-down'
              ? async () => {
                  throw new ProviderUnavailableError('network')
                }
              : () => fetchTicker(),
        })
      }
      return null
    },
  }
}
