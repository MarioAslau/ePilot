import { offerModeEnabled } from 'contracts'
import { activeRound, idempotencyConflict, json, offerError, unauthorized } from '../http.js'
import { log } from '../log.js'
import { offerResponse, readFeatures, type OfferConflict, type OfferRecord } from '../offer.js'
import type { PlayerRecord } from '../playerStore.js'
import { authenticate, type HandlerDeps } from './common.js'

type Response = ReturnType<typeof json>

/** Authenticate, then load an offer that belongs to the player and whose mode is enabled. */
export async function loadOffer(
  header: string | undefined,
  offerId: string | undefined,
  requestId: string,
  deps: Pick<HandlerDeps, 'players' | 'predictions' | 'now' | 'features'>,
): Promise<{ player: PlayerRecord; offer: OfferRecord; offerId: string; clock: Date } | { response: Response }> {
  if (!offerId) return { response: offerError(requestId, 'OFFER_NOT_FOUND') }
  const player = await authenticate(header, deps.players)
  if (!player) return { response: unauthorized(requestId) }
  const offer = await deps.predictions.getOffer(player.playerId, offerId)
  if (!offer || offer.playerId !== player.playerId || !offerModeEnabled(offer.mode, deps.features ?? readFeatures())) {
    return { response: offerError(requestId, 'OFFER_NOT_FOUND') }
  }
  return { player, offer, offerId, clock: (deps.now ?? (() => new Date()))() }
}

export function rejectOffer(requestId: string, reason: OfferConflict | 'ACTIVE_ROUND' | 'IDEMPOTENCY_CONFLICT') {
  log('offer.rejected', { requestId, reason })
  if (reason === 'ACTIVE_ROUND') return activeRound(requestId)
  if (reason === 'IDEMPOTENCY_CONFLICT') return idempotencyConflict(requestId, 'offer')
  return offerError(requestId, reason)
}

export function offerJson(offer: OfferRecord, now: Date) {
  return json(200, offerResponse(offer, now))
}
