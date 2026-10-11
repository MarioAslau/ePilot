import type { Mode, OfferPayout, Outcome, ScoreDelta } from 'contracts'

export function scoreFor(mode: Mode, outcome: Outcome): ScoreDelta {
  if (mode === 'REDEMPTION') return outcome === 'WIN' ? 4 : -2
  if (mode === 'DOUBLE_DOWN') return outcome === 'WIN' ? 2 : -2
  return outcome === 'WIN' ? 1 : -1
}

export function payoutFor(mode: 'DOUBLE_DOWN' | 'REDEMPTION'): OfferPayout {
  if (mode === 'REDEMPTION') return { win: 4, loss: -2, parentDelta: -1 }
  return { win: 2, loss: -2, parentDelta: 1 }
}
