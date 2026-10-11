import { fetchTicker, ProviderUnavailableError } from './coinbase.js'
import { handleCreatePlayer } from './handlers/createPlayer.js'
import { handleCreatePrediction } from './handlers/createPrediction.js'
import { handleGetPredictionHistory } from './handlers/getPredictionHistory.js'
import { handleMarket } from './handlers/market.js'
import { handleMe } from './handlers/me.js'
import { handleResolvePrediction } from './handlers/resolvePrediction.js'
import { memoryGameStore } from './memoryStore.js'

export type DevFault = 'drop-response' | 'provider-down'

/**
 * In-memory game used only by the Vite dev server.
 * The fault switch is not registered on API Gateway.
 */
export function createLocalApp() {
  const store = memoryGameStore()
  let nextFault: DevFault | null = null
  let equalNext = false
  let resolutionHolds = 0

  function scheduleResolution(input: { playerId: string; predictionId: string; dueAt: string }) {
    const run = async () => {
      const current = await store.getPrediction(input.playerId, input.predictionId)
      if (!current || current.status === 'RESOLVED') return
      const result = await handleResolvePrediction(
        { ...input, executionName: 'local' },
        {
          predictions: store,
          players: store,
          quote: async () => {
            if (resolutionHolds > 0) {
              resolutionHolds -= 1
              throw new ProviderUnavailableError('network')
            }
            const ticker = await fetchTicker()
            if (equalNext) {
              equalNext = false
              return { ...ticker, price: current.entryPrice }
            }
            return ticker
          },
        },
      )
      if (result.status === 'SETTLED' || result.status === 'ALREADY_SETTLED' || result.status === 'ORPHANED') return
      const delay = result.status === 'EQUAL_PRICE' ? 5_000 : result.status === 'PROVIDER_HOLD' ? 15_000 : 1_000
      setTimeout(() => void run(), delay)
    }
    setTimeout(() => void run(), Math.max(0, new Date(input.dueAt).getTime() - Date.now()))
  }

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
      query?: Record<string, string | undefined>,
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
        if (mode === 'equal-price') {
          equalNext = true
          return { statusCode: 204, body: '' }
        }
        if (mode === 'resolution-provider-down') {
          resolutionHolds = 2
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
      if (method === 'GET' && path === '/api/predictions') {
        return handleGetPredictionHistory(authorization, query, 'local', {
          players: store,
          predictions: store,
        })
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
          startWorkflow: async (input) => {
            scheduleResolution(input)
          },
        })
      }
      return null
    },
  }
}
