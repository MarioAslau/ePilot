import type { Mode, OfferMode, OfferPayout, Outcome, ScoreDelta } from './index.js'

export interface OfferRule {
  /** The standard-round outcome that opens this offer. */
  trigger: Outcome
  payout: OfferPayout
  /** True when the bonus round must repeat the parent's direction. */
  directionFixed: boolean
}

/**
 * The single source of truth for optional rounds.
 * Scoring, offer creation, and every payout shown in the UI read from here.
 */
export const OFFER_RULES = {
  DOUBLE_DOWN: { trigger: 'WIN', payout: { win: 2, loss: -2, parentDelta: 1 }, directionFixed: true },
  REDEMPTION: { trigger: 'LOSS', payout: { win: 4, loss: -2, parentDelta: -1 }, directionFixed: false },
} as const satisfies Record<OfferMode, OfferRule>

export const OFFER_MODES = Object.keys(OFFER_RULES) as OfferMode[]

export function scoreDelta(mode: Mode, outcome: Outcome): ScoreDelta {
  if (mode === 'STANDARD') return outcome === 'WIN' ? 1 : -1
  const { payout } = OFFER_RULES[mode]
  return outcome === 'WIN' ? payout.win : payout.loss
}

/** Pair totals for an offer: the kept parent delta plus the bonus result. */
export function pairTotals(payout: OfferPayout): { win: number; loss: number } {
  return { win: payout.parentDelta + payout.win, loss: payout.parentDelta + payout.loss }
}

export interface Features {
  doubleDown: boolean
  redemption: boolean
}

export function offerModeEnabled(mode: OfferMode, features: Features): boolean {
  return mode === 'REDEMPTION' ? features.redemption : features.doubleDown
}
