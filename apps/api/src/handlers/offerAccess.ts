import { errorResponse, json } from '../http.js'
import { log } from '../log.js'
import { offerResponse, type OfferConflict, type OfferRecord } from '../offer.js'
import type { PlayerRecord } from '../playerStore.js'
import { authenticate, type HandlerDeps } from './common.js'

type Response = ReturnType<typeof json>

/** Authenticate, then load an offer that belongs to the player. */
export async function loadOffer(
  header: string | undefined,
  offerId: string | undefined,
  requestId: string,
  deps: Pick<HandlerDeps, 'players' | 'predictions' | 'now'>,
): Promise<{ player: PlayerRecord; offer: OfferRecord; offerId: string; clock: Date } | { response: Response }> {
  if (!offerId) return { response: errorResponse('OFFER_NOT_FOUND', requestId) }
  const player = await authenticate(header, deps.players)
  if (!player) return { response: errorResponse('UNAUTHORIZED', requestId) }
  const offer = await deps.predictions.getOffer(player.playerId, offerId)
  if (!offer || offer.playerId !== player.playerId) {
    return { response: errorResponse('OFFER_NOT_FOUND', requestId) }
  }
  return { player, offer, offerId, clock: (deps.now ?? (() => new Date()))() }
}

export function rejectOffer(requestId: string, reason: OfferConflict | 'ACTIVE_ROUND' | 'IDEMPOTENCY_CONFLICT') {
  log('offer.rejected', { requestId, reason })
  return errorResponse(reason, requestId)
}

export function offerJson(offer: OfferRecord, now: Date) {
  return json(200, offerResponse(offer, now))
}
