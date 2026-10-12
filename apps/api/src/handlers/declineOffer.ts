import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { authorizationHeader } from '../http.js'
import { log } from '../log.js'
import { offerConflict } from '../offer.js'
import { productionStores } from '../stores.js'
import type { HandlerDeps } from './common.js'
import { loadOffer, offerJson, rejectOffer } from './offerAccess.js'

export async function handleDeclineOffer(
  header: string | undefined,
  rawOfferId: string | undefined,
  requestId: string,
  deps: HandlerDeps,
) {
  const loaded = await loadOffer(header, rawOfferId, requestId, deps)
  if ('response' in loaded) return loaded.response
  const { player, offer, offerId, clock } = loaded
  if (offer.status === 'DECLINED') return offerJson(offer, clock)
  const blocked = offerConflict(offer, clock)
  if (blocked) return rejectOffer(requestId, blocked)

  const outcome = await deps.predictions.declineOffer(player.playerId, offerId)
  const stored = await deps.predictions.getOffer(player.playerId, offerId)
  if (outcome === 'declined' && stored) {
    log('offer.declined', { requestId, playerId: player.playerId, offerId, mode: offer.mode })
    return offerJson(stored, clock)
  }
  if (stored?.status === 'DECLINED') return offerJson(stored, clock)
  return rejectOffer(requestId, offerConflict(stored, clock) ?? 'OFFER_NOT_FOUND')
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleDeclineOffer(authorizationHeader(event.headers), event.pathParameters?.offerId, event.requestContext.requestId, productionStores())
