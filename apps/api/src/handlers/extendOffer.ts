import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { authorizationHeader } from '../http.js'
import { log } from '../log.js'
import { offerConflict } from '../offer.js'
import { productionStores } from '../stores.js'
import type { HandlerDeps } from './common.js'
import { loadOffer, offerJson, rejectOffer } from './offerAccess.js'

export async function handleExtendOffer(
  header: string | undefined,
  rawOfferId: string | undefined,
  requestId: string,
  deps: HandlerDeps,
) {
  const loaded = await loadOffer(header, rawOfferId, requestId, deps)
  if ('response' in loaded) return loaded.response
  const { player, offer, offerId, clock } = loaded
  const blocked = offerConflict(offer, clock, 'extend')
  if (blocked) return rejectOffer(requestId, blocked)

  const outcome = await deps.predictions.extendOffer(player.playerId, offerId, offer.expiresAt, clock.toISOString())
  const stored = await deps.predictions.getOffer(player.playerId, offerId)
  if (!stored) return rejectOffer(requestId, 'OFFER_NOT_FOUND')
  if (outcome === 'conflict') {
    // Another tab may have extended first; report the offer as it is now.
    const reason = offerConflict(stored, clock, 'extend')
    return reason ? rejectOffer(requestId, reason) : offerJson(stored, clock)
  }
  log('offer.extended', { requestId, playerId: player.playerId, offerId, mode: offer.mode, extensions: String(stored.extensions) })
  return offerJson(stored, clock)
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleExtendOffer(authorizationHeader(event.headers), event.pathParameters?.offerId, event.requestContext.requestId, productionStores())
