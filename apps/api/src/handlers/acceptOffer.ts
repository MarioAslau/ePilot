import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { IdempotencyKeySchema, OFFER_RULES, OfferActionRequestSchema, type Direction } from 'contracts'
import { z } from 'zod'
import { authorizationHeader, errorResponse, json } from '../http.js'
import { log } from '../log.js'
import { offerConflict, type OfferRecord } from '../offer.js'
import {
  buildPrediction,
  predictionResponse,
  workflowExecutionName,
  type IdempotencyRecord,
} from '../prediction.js'
import { productionStores } from '../stores.js'
import { startPredictionWorkflow } from '../workflowClient.js'
import { lockEntryQuote, readJsonBody, replayPrediction, startRound, withDefaults, type HandlerDeps } from './common.js'
import { loadOffer, rejectOffer } from './offerAccess.js'

const KeyOnlySchema = z.object({ idempotencyKey: IdempotencyKeySchema })

/** The bonus direction: the parent's when the mode fixes it, otherwise the player's choice. */
function bonusDirection(offer: OfferRecord, chosen: Direction | undefined): Direction | undefined {
  return OFFER_RULES[offer.mode].directionFixed ? offer.direction : chosen
}

export async function handleAcceptOffer(
  header: string | undefined,
  rawOfferId: string | undefined,
  rawBody: string | undefined,
  requestId: string,
  input: HandlerDeps,
) {
  const deps = withDefaults(input)
  const loaded = await loadOffer(header, rawOfferId, requestId, deps)
  if ('response' in loaded) return loaded.response
  const { player, offer, offerId, clock } = loaded
  const { playerId } = player
  const choosesDirection = !OFFER_RULES[offer.mode].directionFixed

  const request = readJsonBody(rawBody)
  if (!request.ok) return errorResponse('INVALID_INPUT', requestId)
  const body = OfferActionRequestSchema.safeParse(request.value)
  if (!body.success) {
    // A valid key with a bad direction asks the player to choose, where choosing is allowed.
    return choosesDirection && KeyOnlySchema.safeParse(request.value).success ? errorResponse('DIRECTION_REQUIRED', requestId) : errorResponse('INVALID_INPUT', requestId)
  }
  const { idempotencyKey } = body.data
  const direction = bonusDirection(offer, body.data.direction)
  if (!direction) return errorResponse('DIRECTION_REQUIRED', requestId)

  const sameAccept = (record: IdempotencyRecord) =>
    record.kind === 'OFFER_ACCEPT' && record.offerId === offerId && record.direction === direction

  const existing = await deps.predictions.getIdempotency(playerId, idempotencyKey)
  if (existing) {
    return sameAccept(existing)
      ? replayPrediction(deps.predictions, existing, requestId)
      : rejectOffer(requestId, 'IDEMPOTENCY_CONFLICT')
  }

  const blocked = offerConflict(offer, clock)
  if (blocked) return rejectOffer(requestId, blocked)
  if (player.activePredictionId) return rejectOffer(requestId, 'ACTIVE_ROUND')

  const locked = await lockEntryQuote(deps.quote, () => clock, (reason) => log('offer.rejected', { requestId, playerId, offerId, reason }))
  if (!locked) return errorResponse('PROVIDER_UNAVAILABLE', requestId)
  const { quote } = locked

  const built = buildPrediction({
    now: clock,
    playerId,
    direction,
    idempotencyKey,
    entryPrice: quote.price,
    entryTradeTime: quote.tradeTime,
    entryFetchedAt: quote.fetchedAt,
    nextBytes: deps.nextBytes,
    mode: offer.mode,
    parentPredictionId: offer.parentPredictionId,
    offerId,
  })
  const outcome = await deps.predictions.acceptOffer({
    ...built,
    offerId,
    now: clock.toISOString(),
    ...(choosesDirection ? { chosenDirection: direction } : {}),
  })
  if (outcome === 'duplicate_key') {
    const raced = await deps.predictions.getIdempotency(playerId, idempotencyKey)
    return raced && sameAccept(raced)
      ? replayPrediction(deps.predictions, raced, requestId)
      : rejectOffer(requestId, 'IDEMPOTENCY_CONFLICT')
  }
  if (outcome === 'conflict') {
    const reason = offerConflict(await deps.predictions.getOffer(playerId, offerId), clock)
    if (reason) return rejectOffer(requestId, reason)
    const current = await deps.players.get(playerId)
    return rejectOffer(requestId, current?.activePredictionId ? 'ACTIVE_ROUND' : 'OFFER_EXPIRED')
  }

  const { predictionId } = built.prediction
  log('offer.accepted', {
    requestId,
    playerId,
    offerId,
    mode: offer.mode,
    predictionId,
    executionName: workflowExecutionName(predictionId),
  })
  await startRound(deps.startWorkflow, built.prediction, requestId)
  return json(201, predictionResponse(built.prediction))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleAcceptOffer(
    authorizationHeader(event.headers),
    event.pathParameters?.offerId,
    event.body,
    event.requestContext.requestId,
    { ...productionStores(), startWorkflow: startPredictionWorkflow },
  )
