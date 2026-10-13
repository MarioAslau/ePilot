import { randomBytes } from 'node:crypto'
import type { z } from 'zod'
import { fetchTicker, ProviderUnavailableError, SETTLEMENT_TRADE_AGE_MS, tradeAgeWithin, type TickerQuote } from '../coinbase.js'
import { errorResponse, json } from '../http.js'
import { log } from '../log.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import type { PlayerRecord, PlayerStore } from '../playerStore.js'
import {
  predictionResponse,
  workflowExecutionName,
  type IdempotencyRecord,
  type PredictionRecord,
} from '../prediction.js'
import type { PredictionStore } from '../predictionStore.js'
import type { WorkflowInput } from '../workflowClient.js'

/**
 * What the HTTP handlers need. Tests and local play inject the optional parts;
 * `withDefaults` fills the production ones in one place.
 */
export interface HandlerDeps {
  players: PlayerStore
  predictions: PredictionStore
  now?: () => Date
  nextBytes?: (size: number) => Buffer
  quote?: () => Promise<TickerQuote>
  startWorkflow?: (input: WorkflowInput) => Promise<void>
}

export function withDefaults<T extends HandlerDeps>(deps: T) {
  const now = deps.now ?? (() => new Date())
  return {
    ...deps,
    now,
    nextBytes: deps.nextBytes ?? randomBytes,
    quote: deps.quote ?? (() => fetchTicker({ now })),
  }
}

/** The player behind a `Bearer <playerId>.<token>` header, or null for any mismatch. */
export async function authenticate(header: string | undefined, players: PlayerStore): Promise<PlayerRecord | null> {
  const auth = readPlayerAuthorization(header)
  if (!auth) return null
  const player = await players.get(auth.playerId)
  return player && tokenMatches(player.accessTokenHash, auth.accessToken) ? player : null
}

/** The parsed JSON body, or `{ ok: false }` when it is not JSON. An empty body is `null`. */
export function readJsonBody(raw: string | undefined): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: raw ? JSON.parse(raw) : null }
  } catch {
    return { ok: false }
  }
}

export function parseBody<T>(raw: string | undefined, schema: z.ZodType<T>): T | null {
  const body = readJsonBody(raw)
  if (!body.ok) return null
  const parsed = schema.safeParse(body.value)
  return parsed.success ? parsed.data : null
}

/**
 * Fetch an entry quote and check the trade is fresh enough to lock as an entry price.
 * The clock is read after the fetch, so the round starts no earlier than its quote.
 */
export async function lockEntryQuote(
  quote: () => Promise<TickerQuote>,
  now: () => Date,
  reject: (reason: string) => void,
): Promise<{ quote: TickerQuote; clock: Date } | null> {
  let fetched: TickerQuote
  try {
    fetched = await quote()
  } catch (error) {
    reject(error instanceof ProviderUnavailableError ? error.reason : 'network')
    return null
  }
  const clock = now()
  if (!tradeAgeWithin(fetched.tradeTime, clock, SETTLEMENT_TRADE_AGE_MS)) {
    reject('stale_trade')
    return null
  }
  return { quote: fetched, clock }
}

/** Replay the round an idempotency key already created. */
export async function replayPrediction(
  predictions: PredictionStore,
  record: IdempotencyRecord,
  requestId: string,
) {
  const stored = await predictions.getPrediction(record.playerId, record.predictionId)
  return stored ? json(200, predictionResponse(stored)) : errorResponse('PROVIDER_UNAVAILABLE', requestId)
}

/**
 * Start the settlement workflow. A failure is logged, not returned:
 * the round is already saved and the recovery job restarts missing workflows.
 */
export async function startRound(
  startWorkflow: HandlerDeps['startWorkflow'],
  prediction: PredictionRecord,
  requestId: string,
): Promise<void> {
  if (!startWorkflow) return
  const { playerId, predictionId, dueAt } = prediction
  try {
    await startWorkflow({ playerId, predictionId, dueAt })
  } catch {
    log('prediction.workflow_start_failed', {
      requestId,
      playerId,
      predictionId,
      executionName: workflowExecutionName(predictionId),
    })
  }
}
