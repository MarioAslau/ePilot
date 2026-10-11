import { OfferSchema, type Direction, type Offer } from 'contracts'

export const OFFER_WINDOW_MS = 10_000
export const EXTENSION_MS = 20_000
export const MAX_EXTENSIONS = 10
export const OFFER_VISIBLE_MS = 60_000

export type StoredOfferStatus = 'OPEN' | 'ACCEPTED' | 'DECLINED' | 'REPLACED'

export interface OfferRecord {
  offerId: string
  playerId: string
  parentPredictionId: string
  direction: Direction
  issuedAt: string
  expiresAt: string
  extensions: number
  status: StoredOfferStatus
  createdAt: string
  bonusPredictionId?: string
  replacedByPredictionId?: string
}

export function offerIdFor(parentPredictionId: string): string {
  return `o_${parentPredictionId}`
}

export function offerKey(playerId: string, offerId: string) {
  return { pk: `PLAYER#${playerId}`, sk: `OFFER#${offerId}` }
}

export function offerExpiresAt(issuedAt: string, extensions = 0): string {
  return new Date(new Date(issuedAt).getTime() + OFFER_WINDOW_MS + extensions * EXTENSION_MS).toISOString()
}

export function doubleDownEnabled(value = process.env.FEATURE_DOUBLE_DOWN): boolean {
  return value === 'on'
}

/** Local play defaults on. An explicit env value still wins. */
export function localDoubleDownEnabled(): boolean {
  if (process.env.FEATURE_DOUBLE_DOWN === undefined) return true
  return process.env.FEATURE_DOUBLE_DOWN === 'on'
}

export function offerView(offer: OfferRecord, now: Date): Omit<OfferRecord, 'status'> & { status: Offer['status'] } {
  if (offer.status === 'OPEN' && now.getTime() >= new Date(offer.expiresAt).getTime()) {
    return { ...offer, status: 'EXPIRED' }
  }
  return offer
}

export function offerIsVisible(offer: OfferRecord, now: Date): boolean {
  if (offer.status === 'OPEN' && now.getTime() < new Date(offer.expiresAt).getTime()) return true
  return now.getTime() < new Date(offer.expiresAt).getTime() + OFFER_VISIBLE_MS
}

export function offerResponse(offer: OfferRecord, now: Date): Offer {
  const view = offerView(offer, now)
  return OfferSchema.parse({
    offerId: view.offerId,
    parentPredictionId: view.parentPredictionId,
    direction: view.direction,
    issuedAt: view.issuedAt,
    expiresAt: view.expiresAt,
    extensions: view.extensions,
    status: view.status,
    ...(view.bonusPredictionId ? { bonusPredictionId: view.bonusPredictionId } : {}),
    ...(view.replacedByPredictionId ? { replacedByPredictionId: view.replacedByPredictionId } : {}),
  })
}

export type OfferConflict =
  | 'OFFER_NOT_FOUND'
  | 'OFFER_EXPIRED'
  | 'OFFER_ACCEPTED'
  | 'OFFER_DECLINED'
  | 'OFFER_REPLACED'
  | 'MAX_EXTENSIONS'

export function offerConflict(offer: OfferRecord | null, now: Date, action: 'accept' | 'extend' = 'accept'): OfferConflict | null {
  if (!offer) return 'OFFER_NOT_FOUND'
  const view = offerView(offer, now)
  if (view.status === 'EXPIRED') return 'OFFER_EXPIRED'
  if (view.status === 'ACCEPTED') return 'OFFER_ACCEPTED'
  if (view.status === 'DECLINED') return 'OFFER_DECLINED'
  if (view.status === 'REPLACED') return 'OFFER_REPLACED'
  if (action === 'extend' && offer.extensions >= MAX_EXTENSIONS) return 'MAX_EXTENSIONS'
  return null
}

export function asOffer(item: Record<string, unknown>): OfferRecord {
  const status = item.status
  const stored: StoredOfferStatus =
    status === 'ACCEPTED' || status === 'DECLINED' || status === 'REPLACED' ? status : 'OPEN'
  return {
    offerId: String(item.offerId),
    playerId: String(item.playerId),
    parentPredictionId: String(item.parentPredictionId),
    direction: item.direction === 'DOWN' ? 'DOWN' : 'UP',
    issuedAt: String(item.issuedAt),
    expiresAt: String(item.expiresAt),
    extensions: Number(item.extensions),
    status: stored,
    createdAt: String(item.createdAt),
    ...(typeof item.bonusPredictionId === 'string' ? { bonusPredictionId: item.bonusPredictionId } : {}),
    ...(typeof item.replacedByPredictionId === 'string' ? { replacedByPredictionId: item.replacedByPredictionId } : {}),
  }
}
