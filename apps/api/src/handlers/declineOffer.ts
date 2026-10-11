import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { authorizationHeader } from '../http.js'
import { offerConflict } from '../offer.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'
import { loadOffer, offerJson, rejectOffer } from './offerAccess.js'

export async function handleDeclineOffer(
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
  if (offer.status === 'DECLINED') return offerJson(offer, clock)
  const blocked = offerConflict(offer, clock)
  if (blocked) return rejectOffer(requestId, blocked)
  if (!offerId) return rejectOffer(requestId, 'OFFER_NOT_FOUND')

  const outcome = await deps.predictions.declineOffer(player.playerId, offerId)
  const stored = await deps.predictions.getOffer(player.playerId, offerId)
  if (outcome === 'declined' && stored) {
    console.log(JSON.stringify({ event: 'offer.declined', requestId, playerId: player.playerId, offerId, mode: offer.mode }))
    return offerJson(stored, clock)
  }
  if (stored?.status === 'DECLINED') return offerJson(stored, clock)
  const reason = offerConflict(stored, clock)
  return rejectOffer(requestId, reason ?? 'OFFER_NOT_FOUND')
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleDeclineOffer(authorizationHeader(event.headers), event.pathParameters?.offerId, event.requestContext.requestId, {
    players: dynamoPlayerStore(),
    predictions: dynamoPredictionStore(),
  })
