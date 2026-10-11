import { describe, expect, it } from 'vitest'
import { payoutFor, scoreFor } from './scoring.js'

describe('scoreFor', () => {
  it('keeps standard rounds at one point and bonus rounds at two', () => {
    expect(scoreFor('STANDARD', 'WIN')).toBe(1)
    expect(scoreFor('STANDARD', 'LOSS')).toBe(-1)
    expect(scoreFor('DOUBLE_DOWN', 'WIN')).toBe(2)
    expect(scoreFor('DOUBLE_DOWN', 'LOSS')).toBe(-2)
    expect(scoreFor('REDEMPTION', 'WIN')).toBe(4)
    expect(scoreFor('REDEMPTION', 'LOSS')).toBe(-2)
    expect(scoreFor('STANDARD', 'WIN') + scoreFor('DOUBLE_DOWN', 'WIN')).toBe(3)
    expect(scoreFor('STANDARD', 'WIN') + scoreFor('DOUBLE_DOWN', 'LOSS')).toBe(-1)
    expect(scoreFor('STANDARD', 'LOSS') + scoreFor('REDEMPTION', 'WIN')).toBe(3)
    expect(scoreFor('STANDARD', 'LOSS') + scoreFor('REDEMPTION', 'LOSS')).toBe(-3)
  })

  it('publishes the offer payout from the same table', () => {
    expect(payoutFor('DOUBLE_DOWN')).toEqual({ win: 2, loss: -2, parentDelta: 1 })
    expect(payoutFor('REDEMPTION')).toEqual({ win: 4, loss: -2, parentDelta: -1 })
  })
})
