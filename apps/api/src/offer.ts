import { z } from 'zod'
import {
  DirectionSchema,
  OFFER_MODES,
  OFFER_RULES,
  OfferModeSchema,
  OfferSchema,
  offerModeEnabled,
  type Direction,
  type Features,
  type Offer,
  type OfferMode,
  type Outcome,
} from 'contracts'
import type { PredictionRecord } from './prediction.js'

export const OFFER_WINDOW_MS = 10_000
export const EXTENSION_MS = 20_000
export const MAX_EXTENSIONS = 10
export const OFFER_VISIBLE_MS = 60_000

/**
 * A stored offer, decoded strictly at the store boundary. EXPIRED is derived, never stored.
 * `mode` is absent on offers written before Redemption, which were all Double Down.
 */
export const OfferRecordSchema = z.object({
  offerId: z.string(),
  playerId: z.string(),
  parentPredictionId: z.string(),
  mode: OfferModeSchema.default('DOUBLE_DOWN'),
  direction: DirectionSchema.optional(),
  chosenDirection: DirectionSchema.optional(),
  issuedAt: z.string(),
  expiresAt: z.string(),
  extensions: z.number().int(),
  status: z.enum(['OPEN', 'ACCEPTED', 'DECLINED', 'REPLACED']),
  createdAt: z.string(),
  bonusPredictionId: z.string().optional(),
  replacedByPredictionId: z.string().optional(),
})
export type OfferRecord = z.infer<typeof OfferRecordSchema>

export function offerIdFor(parentPredictionId: string): string {
  return `o_${parentPredictionId}`
}

export function offerKey(playerId: string, offerId: string) {
  return { pk: `PLAYER#${playerId}`, sk: `OFFER#${offerId}` }
}

export function offerExpiresAt(issuedAt: string, extensions = 0): string {
  return new Date(new Date(issuedAt).getTime() + OFFER_WINDOW_MS + extensions * EXTENSION_MS).toISOString()
}

/**
 * Feature flags from the environment. `on` enables a mode.
 * Local play passes `localDefault: true` so an unset variable means on; an explicit value still wins.
 */
export function readFeatures(
  env: Record<string, string | undefined> = process.env,
  { localDefault = false }: { localDefault?: boolean } = {},
): Features {
  const flag = (value: string | undefined) => (value === undefined ? localDefault : value === 'on')
  return { doubleDown: flag(env.FEATURE_DOUBLE_DOWN), redemption: flag(env.FEATURE_REDEMPTION) }
}

/** The offer a settled standard round grants, if any. Bonus rounds never chain. */
export interface OfferGrant {
  offerId: string
  mode: OfferMode
  /** Set when the mode fixes the bonus direction to the parent's. */
  direction?: Direction
  parentPredictionId: string
}

export function offerFor(
  prediction: Pick<PredictionRecord, 'predictionId' | 'direction' | 'mode'>,
  outcome: Outcome,
  features: Features,
): OfferGrant | undefined {
  if (prediction.mode !== 'STANDARD') return undefined
  const mode = OFFER_MODES.find((candidate) => OFFER_RULES[candidate].trigger === outcome && offerModeEnabled(candidate, features))
  if (!mode) return undefined
  return {
    offerId: offerIdFor(prediction.predictionId),
    mode,
    ...(OFFER_RULES[mode].directionFixed ? { direction: prediction.direction } : {}),
    parentPredictionId: prediction.predictionId,
  }
}

export function newOfferRecord(playerId: string, grant: OfferGrant, issuedAt: string): OfferRecord {
  return {
    offerId: grant.offerId,
    playerId,
    parentPredictionId: grant.parentPredictionId,
    mode: grant.mode,
    ...(grant.direction ? { direction: grant.direction } : {}),
    issuedAt,
    expiresAt: offerExpiresAt(issuedAt),
    extensions: 0,
    status: 'OPEN',
    createdAt: issuedAt,
  }
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
    mode: view.mode,
    direction: view.direction ?? null,
    payout: OFFER_RULES[view.mode].payout,
    issuedAt: view.issuedAt,
    expiresAt: view.expiresAt,
    extensions: view.extensions,
    status: view.status,
    ...(view.bonusPredictionId ? { bonusPredictionId: view.bonusPredictionId } : {}),
    ...(view.replacedByPredictionId ? { replacedByPredictionId: view.replacedByPredictionId } : {}),
    ...(view.chosenDirection ? { chosenDirection: view.chosenDirection } : {}),
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
