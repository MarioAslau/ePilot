import type { Offer } from 'contracts'

export type OfferPhase = 'open' | 'submitting' | 'expired' | 'declined' | 'used' | 'replaced'

export interface OfferLocal {
  seenOfferIds: ReadonlySet<string>
  dismissedOfferIds: ReadonlySet<string>
  acceptedHereOfferId: string | null
  replacedHereOfferId: string | null
  mutation: 'accept' | 'decline' | 'extend' | null
}

export function offerPhase(offer: Offer | null | undefined, local: OfferLocal, serverNowMs: number): OfferPhase | null {
  if (!offer) return null
  if (local.dismissedOfferIds.has(offer.offerId)) return null
  if (local.replacedHereOfferId === offer.offerId) return null
  const open = offer.status === 'OPEN' && serverNowMs < new Date(offer.expiresAt).getTime()
  if (open) return local.mutation === 'accept' ? 'submitting' : 'open'
  if (!local.seenOfferIds.has(offer.offerId)) return null
  if (offer.status === 'OPEN' || offer.status === 'EXPIRED') return 'expired'
  if (offer.status === 'DECLINED') return 'declined'
  if (offer.status === 'ACCEPTED') return local.acceptedHereOfferId === offer.offerId ? null : 'used'
  if (offer.status === 'REPLACED') return 'replaced'
  return null
}

/**
 * Where an offer shows. `live`: the offer card in the play area. `ended`: a notice in the play area.
 * `elsewhere`: it was used or replaced from another tab, so its notice also sits above an active round.
 */
export type OfferSlot = 'live' | 'ended' | 'elsewhere'

export function offerSlot(phase: OfferPhase | null): OfferSlot | null {
  if (phase === 'open' || phase === 'submitting') return 'live'
  if (phase === 'expired' || phase === 'declined') return 'ended'
  if (phase === 'used' || phase === 'replaced') return 'elsewhere'
  return null
}
