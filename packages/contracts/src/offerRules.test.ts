import { describe, expect, it } from 'vitest'
import { OFFER_RULES, pairTotals, scoreDelta } from './index.js'

describe('offer rules', () => {
  it('scores standard rounds at one point and optional rounds from the payout table', () => {
    expect(scoreDelta('STANDARD', 'WIN')).toBe(1)
    expect(scoreDelta('STANDARD', 'LOSS')).toBe(-1)
    expect(scoreDelta('DOUBLE_DOWN', 'WIN')).toBe(2)
    expect(scoreDelta('DOUBLE_DOWN', 'LOSS')).toBe(-2)
    expect(scoreDelta('REDEMPTION', 'WIN')).toBe(4)
    expect(scoreDelta('REDEMPTION', 'LOSS')).toBe(-2)
  })

  it('pins the payouts and pair totals', () => {
    expect(OFFER_RULES.DOUBLE_DOWN.payout).toEqual({ win: 2, loss: -2, parentDelta: 1 })
    expect(OFFER_RULES.REDEMPTION.payout).toEqual({ win: 4, loss: -2, parentDelta: -1 })
    expect(pairTotals(OFFER_RULES.DOUBLE_DOWN.payout)).toEqual({ win: 3, loss: -1 })
    expect(pairTotals(OFFER_RULES.REDEMPTION.payout)).toEqual({ win: 3, loss: -3 })
  })

  it('opens Double Down on a win and Redemption on a loss', () => {
    expect(OFFER_RULES.DOUBLE_DOWN.trigger).toBe('WIN')
    expect(OFFER_RULES.REDEMPTION.trigger).toBe('LOSS')
  })
})
