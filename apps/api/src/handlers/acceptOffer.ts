import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { OfferActionRequestSchema } from 'contracts'
import { randomBytes } from 'node:crypto'
import { fetchTicker, ProviderUnavailableError, type TickerQuote } from '../coinbase.js'
import { authorizationHeader, invalidInput, json, providerUnavailable } from '../http.js'
import { offerConflict } from '../offer.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import { buildPrediction, tradeIsEntryFresh, workflowExecutionName } from '../prediction.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'
import { startPredictionWorkflow } from '../workflowClient.js'
import { predictionResponse } from './createPrediction.js'
import { loadOffer, rejectOffer } from './offerAccess.js'

function log(event: string, fields: Record<string, string | undefined>) {
  console.log(JSON.stringify({ event, ...fields }))
}

export async function handleAcceptOffer(
  header: string | undefined,
  offerId: string | undefined,
  rawBody: string | undefined,
  requestId: string,
  deps: {
    players: PlayerStore
    predictions: PredictionStore
    now?: () => Date
    nextBytes?: (size: number) => Buffer
    quote?: () => Promise<TickerQuote>
    startWorkflow?: (input: { playerId: string; predictionId: string; dueAt: string }) => Promise<void>
    doubleDown?: boolean
  },
) {
  const loaded = await loadOffer(header, offerId, requestId, deps)
  if ('response' in loaded) return loaded.response
  const { player, offer, clock } = loaded
  if (!offerId) return rejectOffer(requestId, 'OFFER_NOT_FOUND')

  let parsed: unknown
  try {
    parsed = rawBody ? JSON.parse(rawBody) : null
  } catch {
    return invalidInput(requestId)
  }
  const body = OfferActionRequestSchema.safeParse(parsed)
  if (!body.success) return invalidInput(requestId)

  const existing = await deps.predictions.getIdempotency(player.playerId, body.data.idempotencyKey)
  if (existing) {
    if (existing.kind !== 'OFFER_ACCEPT' || existing.offerId !== offerId) {
      return rejectOffer(requestId, 'IDEMPOTENCY_CONFLICT')
    }
    const stored = await deps.predictions.getPrediction(player.playerId, existing.predictionId)
    if (!stored) return providerUnavailable(requestId)
    return json(200, predictionResponse(stored))
  }

  const blocked = offerConflict(offer, clock)
  if (blocked) return rejectOffer(requestId, blocked)
  if (player.activePredictionId) return rejectOffer(requestId, 'ACTIVE_ROUND')

  let quote: TickerQuote
  try {
    quote = await (deps.quote ?? (() => fetchTicker({ now: () => clock })))()
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    log('offer.rejected', { requestId, playerId: player.playerId, offerId, reason })
    return providerUnavailable(requestId)
  }
  if (!tradeIsEntryFresh(quote.tradeTime, clock)) {
    log('offer.rejected', { requestId, playerId: player.playerId, offerId, reason: 'stale_trade' })
    return providerUnavailable(requestId)
  }

  const built = buildPrediction({
    now: clock,
    playerId: player.playerId,
    direction: offer.direction,
    idempotencyKey: body.data.idempotencyKey,
    entryPrice: quote.price,
    entryTradeTime: quote.tradeTime,
    entryFetchedAt: quote.fetchedAt,
    nextBytes: deps.nextBytes ?? randomBytes,
    mode: 'DOUBLE_DOWN',
    parentPredictionId: offer.parentPredictionId,
    offerId,
  })
  const outcome = await deps.predictions.acceptOffer({
    ...built,
    offerId,
    now: clock.toISOString(),
  })
  if (outcome === 'duplicate_key') {
    const raced = await deps.predictions.getIdempotency(player.playerId, body.data.idempotencyKey)
    if (!raced || raced.offerId !== offerId) return rejectOffer(requestId, 'IDEMPOTENCY_CONFLICT')
    const stored = await deps.predictions.getPrediction(player.playerId, raced.predictionId)
    if (!stored) return providerUnavailable(requestId)
    return json(200, predictionResponse(stored))
  }
  if (outcome === 'conflict') {
    const again = await deps.predictions.getOffer(player.playerId, offerId)
    const reason = offerConflict(again, clock)
    if (reason) return rejectOffer(requestId, reason)
    const current = await deps.players.get(player.playerId)
    if (current?.activePredictionId) return rejectOffer(requestId, 'ACTIVE_ROUND')
    return rejectOffer(requestId, 'OFFER_EXPIRED')
  }

  log('offer.accepted', {
    requestId,
    playerId: player.playerId,
    offerId,
    predictionId: built.prediction.predictionId,
    executionName: workflowExecutionName(built.prediction.predictionId),
  })
  if (deps.startWorkflow) {
    try {
      await deps.startWorkflow({
        playerId: player.playerId,
        predictionId: built.prediction.predictionId,
        dueAt: built.prediction.dueAt,
      })
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ExecutionAlreadyExists') {
        log('prediction.workflow_start_failed', {
          requestId,
          playerId: player.playerId,
          predictionId: built.prediction.predictionId,
          executionName: workflowExecutionName(built.prediction.predictionId),
        })
      }
    }
  }
  return json(201, predictionResponse(built.prediction))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleAcceptOffer(
    authorizationHeader(event.headers),
    event.pathParameters?.offerId,
    event.body,
    event.requestContext.requestId,
    {
      players: dynamoPlayerStore(),
      predictions: dynamoPredictionStore(),
      startWorkflow: startPredictionWorkflow,
    },
  )
