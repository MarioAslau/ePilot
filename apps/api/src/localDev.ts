import type { Direction } from 'contracts'
import { fetchTicker, ProviderUnavailableError, type TickerQuote } from './coinbase.js'
import { handleAcceptOffer } from './handlers/acceptOffer.js'
import type { HandlerDeps } from './handlers/common.js'
import { handleCreatePlayer } from './handlers/createPlayer.js'
import { handleCreatePrediction } from './handlers/createPrediction.js'
import { handleDeclineOffer } from './handlers/declineOffer.js'
import { handleExtendOffer } from './handlers/extendOffer.js'
import { handleGetPredictionHistory } from './handlers/getPredictionHistory.js'
import { handleMarket } from './handlers/market.js'
import { handleMe } from './handlers/me.js'
import { handleResolvePrediction } from './handlers/resolvePrediction.js'
import { memoryGameStore } from './memoryStore.js'
import type { DevFault, LocalApp } from './localDevTypes.js'
import { readFeatures } from './offer.js'
import type { WorkflowInput } from './workflowClient.js'

export type { DevFault, LocalApp, LocalResult } from './localDevTypes.js'

/** A scripted resolution price. When several are armed, they apply in this order, one per resolution. */
const SCRIPTED_PRICES = ['equal', 'win', 'loss'] as const
type ScriptedPrice = (typeof SCRIPTED_PRICES)[number]

/** Retry delays after a resolution attempt, matching the Step Functions waits. */
const RETRY_MS = { EQUAL_PRICE: 5_000, PROVIDER_HOLD: 15_000, TOO_EARLY: 1_000 } as const

function shiftedPrice(entry: string, direction: Direction): string {
  const [whole = '0', frac] = entry.split('.')
  const next = direction === 'UP' ? BigInt(whole) + 1n : BigInt(whole) - 1n
  const safe = next < 0n ? 0n : next
  return frac === undefined ? String(safe) : `${safe}.${frac}`
}

const opposite = (direction: Direction): Direction => (direction === 'UP' ? 'DOWN' : 'UP')

const providerDown = async (): Promise<TickerQuote> => {
  throw new ProviderUnavailableError('network')
}

/**
 * In-memory game used only by the Vite dev server.
 * The fault switch is not registered on API Gateway.
 */
export function createLocalApp(): LocalApp {
  const store = memoryGameStore()
  const features = readFeatures(process.env, { localDefault: true })
  let nextFault: DevFault | null = null
  const scripted = new Set<ScriptedPrice>()
  let resolutionHolds = 0

  const DEV_MODES: Record<string, () => void> = {
    'drop-response': () => (nextFault = 'drop-response'),
    'provider-down': () => (nextFault = 'provider-down'),
    'equal-price': () => scripted.add('equal'),
    'next-resolution-win': () => scripted.add('win'),
    'next-resolution-loss': () => scripted.add('loss'),
    'resolution-provider-down': () => (resolutionHolds = 2),
  }

  function takeScripted(): ScriptedPrice | undefined {
    const next = SCRIPTED_PRICES.find((price) => scripted.has(price))
    if (next) scripted.delete(next)
    return next
  }

  function scheduleResolution(input: WorkflowInput) {
    const run = async () => {
      const current = await store.getPrediction(input.playerId, input.predictionId)
      if (!current || current.status === 'RESOLVED') return
      const result = await handleResolvePrediction(
        { ...input, executionName: 'local' },
        {
          predictions: store,
          players: store,
          features,
          quote: async () => {
            if (resolutionHolds > 0) {
              resolutionHolds -= 1
              throw new ProviderUnavailableError('network')
            }
            const ticker = await fetchTicker()
            const script = takeScripted()
            if (script === 'equal') return { ...ticker, price: current.entryPrice }
            if (script === 'win') return { ...ticker, price: shiftedPrice(current.entryPrice, current.direction) }
            if (script === 'loss') return { ...ticker, price: shiftedPrice(current.entryPrice, opposite(current.direction)) }
            return ticker
          },
        },
      )
      if (result.status === 'SETTLED' || result.status === 'ALREADY_SETTLED' || result.status === 'ORPHANED') return
      setTimeout(() => void run(), RETRY_MS[result.status])
    }
    setTimeout(() => void run(), Math.max(0, new Date(input.dueAt).getTime() - Date.now()))
  }

  /** Deps for the handlers that start a round. A provider fault fails the entry quote. */
  function roundDeps(fault: DevFault | null): HandlerDeps {
    return {
      players: store,
      predictions: store,
      features,
      quote: fault === 'provider-down' ? providerDown : () => fetchTicker(),
      startWorkflow: async (input) => scheduleResolution(input),
    }
  }

  return {
    consumeFault() {
      const fault = nextFault
      nextFault = null
      return fault
    },

    async handle(method, path, authorization, rawBody, fault = null, query) {
      if (method === 'POST' && path === '/api/__dev/next-prediction') {
        let mode: string | undefined
        try {
          mode = (JSON.parse(rawBody || '{}') as { mode?: string }).mode
        } catch {
          mode = undefined
        }
        const arm = mode ? DEV_MODES[mode] : undefined
        if (arm) {
          arm()
          return { statusCode: 204, body: '' }
        }
        return {
          statusCode: 400,
          body: JSON.stringify({ code: 'INVALID_INPUT', message: 'Invalid prediction request', requestId: 'local' }),
        }
      }

      if (method === 'POST' && path === '/api/players') return handleCreatePlayer('local', { store })
      if (method === 'GET' && path === '/api/me') {
        return handleMe(authorization, 'local', { players: store, predictions: store, features })
      }
      if (method === 'GET' && path === '/api/market') return handleMarket('local')
      if (method === 'GET' && path === '/api/predictions') {
        return handleGetPredictionHistory(authorization, query, 'local', { players: store, predictions: store })
      }
      if (method === 'POST' && path === '/api/predictions') {
        return handleCreatePrediction(authorization, rawBody, 'local', roundDeps(fault))
      }
      const offerPath = /^\/api\/offers\/([^/]+)\/(accept|decline|extend)$/.exec(path)
      if (method === 'POST' && offerPath?.[1] && offerPath[2]) {
        const offerId = decodeURIComponent(offerPath[1])
        const deps = roundDeps(fault)
        if (offerPath[2] === 'decline') return handleDeclineOffer(authorization, offerId, 'local', deps)
        if (offerPath[2] === 'extend') return handleExtendOffer(authorization, offerId, 'local', deps)
        return handleAcceptOffer(authorization, offerId, rawBody, 'local', deps)
      }
      return null
    },
  }
}
