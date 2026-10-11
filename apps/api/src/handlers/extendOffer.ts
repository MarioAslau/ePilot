import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { authorizationHeader } from '../http.js'
import { offerConflict } from '../offer.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'
import { loadOffer, offerJson, rejectOffer } from './offerAccess.js'

export async function handleExtendOffer(
  header: string | undefined,
  offerId: string | undefined,
  requestId: string,
  deps: {
    players: PlayerStore
    predictions: PredictionStore
    now?: () => Date
    doubleDown?: boolean
    redemption?: boolean
  },
) {
  const loaded = await loadOffer(header, offerId, requestId, deps)
  if ('response' in loaded) return loaded.response
  const { player, offer, clock } = loaded
  if (!offerId) return rejectOffer(requestId, 'OFFER_NOT_FOUND')
  const blocked = offerConflict(offer, clock, 'extend')
  if (blocked) return rejectOffer(requestId, blocked)

  const outcome = await deps.predictions.extendOffer(player.playerId, offerId, offer.expiresAt, clock.toISOString())
  const stored = await deps.predictions.getOffer(player.playerId, offerId)
  if (!stored) return rejectOffer(requestId, 'OFFER_NOT_FOUND')
  if (outcome === 'conflict') {
    const reason = offerConflict(stored, clock, 'extend')
    if (reason) return rejectOffer(requestId, reason)
    return offerJson(stored, clock)
  }
  console.log(JSON.stringify({
    event: 'offer.extended',
    requestId,
    playerId: player.playerId,
    offerId,
    mode: offer.mode,
    extensions: String(stored.extensions),
  }))
  return offerJson(stored, clock)
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleExtendOffer(authorizationHeader(event.headers), event.pathParameters?.offerId, event.requestContext.requestId, {
    players: dynamoPlayerStore(),
    predictions: dynamoPredictionStore(),
  })
