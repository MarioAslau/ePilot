import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { CreatePredictionRequestSchema, type Direction } from 'contracts'
import { authorizationHeader, errorResponse, json } from '../http.js'
import { log } from '../log.js'
import {
  buildPrediction,
  predictionResponse,
  workflowExecutionName,
  type IdempotencyRecord,
} from '../prediction.js'
import { productionStores } from '../stores.js'
import { startPredictionWorkflow } from '../workflowClient.js'
import {
  authenticate,
  lockEntryQuote,
  parseBody,
  replayPrediction,
  startRound,
  withDefaults,
  type HandlerDeps,
} from './common.js'

const DIRECTION_CONFLICT = 'This idempotency key was used for a different direction'

/** A replay of this key is the same plain create, not an offer accept. */
function sameCreate(existing: IdempotencyRecord, direction: Direction) {
  return existing.kind !== 'OFFER_ACCEPT' && existing.direction === direction
}

export async function handleCreatePrediction(
  header: string | undefined,
  rawBody: string | undefined,
  requestId: string,
  input: HandlerDeps,
) {
  const deps = withDefaults(input)
  const player = await authenticate(header, deps.players)
  if (!player) return errorResponse('UNAUTHORIZED', requestId)
  const { playerId } = player
  const rejected = (reason: string, predictionId?: string) =>
    log('prediction.rejected', { requestId, playerId, predictionId, reason })

  const body = parseBody(rawBody, CreatePredictionRequestSchema)
  if (!body) return errorResponse('INVALID_INPUT', requestId)
  const { direction, idempotencyKey } = body

  const existing = await deps.predictions.getIdempotency(playerId, idempotencyKey)
  if (existing) {
    if (!sameCreate(existing, direction)) {
      rejected('IDEMPOTENCY_CONFLICT')
      return errorResponse('IDEMPOTENCY_CONFLICT', requestId, DIRECTION_CONFLICT)
    }
    return replayPrediction(deps.predictions, existing, requestId)
  }

  if (player.activePredictionId) {
    rejected('ACTIVE_ROUND', player.activePredictionId)
    return errorResponse('ACTIVE_ROUND', requestId)
  }

  const locked = await lockEntryQuote(deps.quote, deps.now, rejected)
  if (!locked) return errorResponse('PROVIDER_UNAVAILABLE', requestId)
  const { quote, clock } = locked

  const openOfferId = player.openOfferId
  const openOffer = openOfferId ? await deps.predictions.getOffer(playerId, openOfferId) : null
  const built = buildPrediction({
    now: clock,
    playerId,
    direction,
    idempotencyKey,
    entryPrice: quote.price,
    entryTradeTime: quote.tradeTime,
    entryFetchedAt: quote.fetchedAt,
    nextBytes: deps.nextBytes,
  })
  let outcome = await deps.predictions.create({
    ...built,
    ...(openOfferId ? { openOffer: { kind: 'replace', offerId: openOfferId, now: clock.toISOString() } as const } : {}),
  })
  const replacedOfferId = outcome === 'created' ? openOfferId : undefined
  if (outcome === 'offer_changed') {
    // The offer ended between the read and the write. Start the round anyway and drop the stale pointer.
    const current = await deps.players.get(playerId)
    if (current?.activePredictionId) {
      rejected('ACTIVE_ROUND')
      return errorResponse('ACTIVE_ROUND', requestId)
    }
    outcome = await deps.predictions.create({ ...built, openOffer: { kind: 'clear' } })
  }
  if (outcome === 'duplicate_key') {
    const raced = await deps.predictions.getIdempotency(playerId, idempotencyKey)
    if (!raced || !sameCreate(raced, direction)) return errorResponse('IDEMPOTENCY_CONFLICT', requestId, DIRECTION_CONFLICT)
    return replayPrediction(deps.predictions, raced, requestId)
  }
  if (outcome === 'active_round') {
    rejected('ACTIVE_ROUND')
    return errorResponse('ACTIVE_ROUND', requestId)
  }

  const { predictionId } = built.prediction
  if (replacedOfferId) {
    log('offer.replaced', { requestId, playerId, offerId: replacedOfferId, mode: openOffer?.mode, predictionId })
  }
  const priorRounds = player.wins + player.losses
  log('prediction.created', {
    requestId,
    playerId,
    predictionId,
    executionName: workflowExecutionName(predictionId),
    priorRounds: String(priorRounds),
    repeat: priorRounds > 0 ? 'true' : 'false',
  })
  await startRound(deps.startWorkflow, built.prediction, requestId)
  return json(201, predictionResponse(built.prediction))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleCreatePrediction(authorizationHeader(event.headers), event.body, event.requestContext.requestId, {
    ...productionStores(),
    startWorkflow: startPredictionWorkflow,
  })
