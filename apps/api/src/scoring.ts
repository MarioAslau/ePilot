import type { Outcome } from 'contracts'
import type { ScoreDelta } from 'contracts'

export function scoreFor(mode: 'STANDARD' | 'DOUBLE_DOWN', outcome: Outcome): ScoreDelta {
  if (mode === 'DOUBLE_DOWN') return outcome === 'WIN' ? 2 : -2
  return outcome === 'WIN' ? 1 : -1
}
