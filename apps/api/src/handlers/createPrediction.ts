import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { CreatePredictionRequestSchema, PredictionSchema } from 'contracts'
import { randomBytes } from 'node:crypto'
import { fetchTicker, ProviderUnavailableError, type TickerQuote } from '../coinbase.js'
import {
  activeRound,
  authorizationHeader,
  idempotencyConflict,
  invalidInput,
  json,
  providerUnavailable,
  unauthorized,
} from '../http.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import { buildPrediction, tradeIsEntryFresh, workflowExecutionName, type PredictionRecord } from '../prediction.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'
import { startPredictionWorkflow } from '../workflowClient.js'

export function predictionResponse(record: PredictionRecord) {
  return PredictionSchema.parse({
    predictionId: record.predictionId,
    playerId: record.playerId,
    direction: record.direction,
    mode: record.mode,
    status: record.status,
    createdAt: record.createdAt,
    dueAt: record.dueAt,
    entryPrice: record.entryPrice,
    entryTradeTime: record.entryTradeTime,
    ...(record.status === 'RESOLVED'
      ? {
          resolvedAt: record.resolvedAt,
          resolutionPrice: record.resolutionPrice,
          resolutionTradeTime: record.resolutionTradeTime,
          resolutionFetchedAt: record.resolutionFetchedAt,
          outcome: record.outcome,
          scoreDelta: record.scoreDelta,
        }
      : {}),
  })
}

function log(event: string, fields: Record<string, string | undefined>) {
  console.log(JSON.stringify({ event, ...fields }))
}

export async function handleCreatePrediction(
  header: string | undefined,
  rawBody: string | undefined,
  requestId: string,
  deps: {
    players: PlayerStore
    predictions: PredictionStore
    now?: () => Date
    nextBytes?: (size: number) => Buffer
    quote?: () => Promise<TickerQuote>
    startWorkflow?: (input: { playerId: string; predictionId: string; dueAt: string }) => Promise<void>
  },
) {
  const now = deps.now ?? (() => new Date())
  const auth = readPlayerAuthorization(header)
  if (!auth) return unauthorized(requestId)
  const player = await deps.players.get(auth.playerId)
  if (!player || !tokenMatches(player.accessTokenHash, auth.accessToken)) {
    return unauthorized(requestId)
  }

  let parsed: unknown
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return invalidInput(requestId)
  }
  const body = CreatePredictionRequestSchema.safeParse(parsed)
  if (!body.success) return invalidInput(requestId)

  const existing = await deps.predictions.getIdempotency(auth.playerId, body.data.idempotencyKey)
  if (existing) {
    if (existing.direction !== body.data.direction) {
      log('prediction.rejected', { requestId, playerId: auth.playerId, reason: 'IDEMPOTENCY_CONFLICT' })
      return idempotencyConflict(requestId)
    }
    const stored = await deps.predictions.getPrediction(auth.playerId, existing.predictionId)
    if (!stored) return providerUnavailable(requestId)
    return json(200, predictionResponse(stored))
  }

  if (player.activePredictionId) {
    log('prediction.rejected', {
      requestId,
      playerId: auth.playerId,
      predictionId: player.activePredictionId,
      reason: 'ACTIVE_ROUND',
    })
    return activeRound(requestId)
  }

  let quote: TickerQuote
  try {
    quote = await (deps.quote ?? (() => fetchTicker({ now })))()
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    log('prediction.rejected', { requestId, playerId: auth.playerId, reason })
    return providerUnavailable(requestId)
  }
  const clock = now()
  if (!tradeIsEntryFresh(quote.tradeTime, clock)) {
    log('prediction.rejected', { requestId, playerId: auth.playerId, reason: 'stale_trade' })
    return providerUnavailable(requestId)
  }

  const built = buildPrediction({
    now: clock,
    playerId: auth.playerId,
    direction: body.data.direction,
    idempotencyKey: body.data.idempotencyKey,
    entryPrice: quote.price,
    entryTradeTime: quote.tradeTime,
    entryFetchedAt: quote.fetchedAt,
    nextBytes: deps.nextBytes ?? randomBytes,
  })
  const outcome = await deps.predictions.create(built)
  if (outcome === 'duplicate_key') {
    const raced = await deps.predictions.getIdempotency(auth.playerId, body.data.idempotencyKey)
    if (!raced || raced.direction !== body.data.direction) return idempotencyConflict(requestId)
    const stored = await deps.predictions.getPrediction(auth.playerId, raced.predictionId)
    if (!stored) return providerUnavailable(requestId)
    return json(200, predictionResponse(stored))
  }
  if (outcome === 'active_round') {
    log('prediction.rejected', { requestId, playerId: auth.playerId, reason: 'ACTIVE_ROUND' })
    return activeRound(requestId)
  }

  log('prediction.created', {
    requestId,
    playerId: auth.playerId,
    predictionId: built.prediction.predictionId,
    executionName: workflowExecutionName(built.prediction.predictionId),
  })
  if (deps.startWorkflow) {
    try {
      await deps.startWorkflow({
        playerId: auth.playerId,
        predictionId: built.prediction.predictionId,
        dueAt: built.prediction.dueAt,
      })
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ExecutionAlreadyExists') {
        log('prediction.workflow_start_failed', {
          requestId,
          playerId: auth.playerId,
          predictionId: built.prediction.predictionId,
          executionName: workflowExecutionName(built.prediction.predictionId),
        })
      }
    }
  }
  return json(201, predictionResponse(built.prediction))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleCreatePrediction(
    authorizationHeader(event.headers),
    event.body,
    event.requestContext.requestId,
    {
      players: dynamoPlayerStore(),
      predictions: dynamoPredictionStore(),
      startWorkflow: startPredictionWorkflow,
    },
  )
