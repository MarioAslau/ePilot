import { idempotencyConflict, json, offerError, unauthorized } from '../http.js'
import { doubleDownEnabled, offerResponse, type OfferConflict, type OfferRecord } from '../offer.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import type { PlayerRecord, PlayerStore } from '../playerStore.js'
import type { PredictionStore } from '../predictionStore.js'

type StepResult = ReturnType<typeof json>

export async function loadOffer(
  header: string | undefined,
  offerId: string | undefined,
  requestId: string,
  deps: {
    players: PlayerStore
    predictions: PredictionStore
    now?: () => Date
    doubleDown?: boolean
  },
): Promise<{ player: PlayerRecord; offer: OfferRecord; clock: Date } | { response: StepResult }> {
  if (!offerId) return { response: offerError(requestId, 'OFFER_NOT_FOUND') }
  const enabled = deps.doubleDown ?? doubleDownEnabled()
  if (!enabled) return { response: offerError(requestId, 'OFFER_NOT_FOUND') }
  const auth = readPlayerAuthorization(header)
  if (!auth) return { response: unauthorized(requestId) }
  const player = await deps.players.get(auth.playerId)
  if (!player || !tokenMatches(player.accessTokenHash, auth.accessToken)) {
    return { response: unauthorized(requestId) }
  }
  const offer = await deps.predictions.getOffer(auth.playerId, offerId)
  if (!offer || offer.playerId !== auth.playerId) return { response: offerError(requestId, 'OFFER_NOT_FOUND') }
  return { player, offer, clock: (deps.now ?? (() => new Date()))() }
}

export function rejectOffer(requestId: string, reason: OfferConflict | 'ACTIVE_ROUND' | 'IDEMPOTENCY_CONFLICT') {
  console.log(JSON.stringify({ event: 'offer.rejected', requestId, reason }))
  if (reason === 'ACTIVE_ROUND') {
    return json(409, { code: 'ACTIVE_ROUND', message: 'You already have an active prediction', requestId })
  }
  if (reason === 'IDEMPOTENCY_CONFLICT') return idempotencyConflict(requestId, 'offer')
  return offerError(requestId, reason)
}

export function offerJson(offer: OfferRecord, now: Date) {
  return json(200, offerResponse(offer, now))
}
