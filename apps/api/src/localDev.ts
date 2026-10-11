import { fetchTicker, ProviderUnavailableError } from './coinbase.js'
import { handleAcceptOffer } from './handlers/acceptOffer.js'
import { handleCreatePlayer } from './handlers/createPlayer.js'
import { handleCreatePrediction } from './handlers/createPrediction.js'
import { handleDeclineOffer } from './handlers/declineOffer.js'
import { handleExtendOffer } from './handlers/extendOffer.js'
import { handleGetPredictionHistory } from './handlers/getPredictionHistory.js'
import { handleMarket } from './handlers/market.js'
import { handleMe } from './handlers/me.js'
import { handleResolvePrediction } from './handlers/resolvePrediction.js'
import { memoryGameStore } from './memoryStore.js'
import { localDoubleDownEnabled, localRedemptionEnabled } from './offer.js'

function favourablePrice(entry: string, direction: 'UP' | 'DOWN'): string {
  const [whole = '0', frac] = entry.split('.')
  const next = direction === 'UP' ? BigInt(whole) + 1n : BigInt(whole) - 1n
  const safe = next < 0n ? 0n : next
  return frac === undefined ? String(safe) : `${safe}.${frac}`
}

export type DevFault = 'drop-response' | 'provider-down'

/**
 * In-memory game used only by the Vite dev server.
 * The fault switch is not registered on API Gateway.
 */
export function createLocalApp() {
  const store = memoryGameStore()
  let nextFault: DevFault | null = null
  let equalNext = false
  let winNext = false
  let lossNext = false
  let resolutionHolds = 0
  const doubleDown = localDoubleDownEnabled()
  const redemption = localRedemptionEnabled()

  function scheduleResolution(input: { playerId: string; predictionId: string; dueAt: string }) {
    const run = async () => {
      const current = await store.getPrediction(input.playerId, input.predictionId)
      if (!current || current.status === 'RESOLVED') return
      const result = await handleResolvePrediction(
        { ...input, executionName: 'local' },
        {
          predictions: store,
          players: store,
          doubleDown,
          redemption,
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
            if (winNext) {
              winNext = false
              return { ...ticker, price: favourablePrice(current.entryPrice, current.direction) }
            }
            if (lossNext) {
              lossNext = false
              const opposite = current.direction === 'UP' ? 'DOWN' : 'UP'
              return { ...ticker, price: favourablePrice(current.entryPrice, opposite) }
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
        if (mode === 'next-resolution-win') {
          winNext = true
          return { statusCode: 204, body: '' }
        }
        if (mode === 'next-resolution-loss') {
          lossNext = true
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
        return handleMe(authorization, 'local', { store, predictions: store, doubleDown, redemption })
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
      const offerPath = /^\/api\/offers\/([^/]+)\/(accept|decline|extend)$/.exec(path)
      if (method === 'POST' && offerPath?.[1] && offerPath[2]) {
        const offerId = decodeURIComponent(offerPath[1])
        const offerDeps = { players: store, predictions: store, doubleDown, redemption }
        if (offerPath[2] === 'decline') return handleDeclineOffer(authorization, offerId, 'local', offerDeps)
        if (offerPath[2] === 'extend') return handleExtendOffer(authorization, offerId, 'local', offerDeps)
        return handleAcceptOffer(authorization, offerId, rawBody, 'local', {
          ...offerDeps,
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
