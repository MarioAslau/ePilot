import { describe, expect, it } from 'vitest'
import { scoreFor } from './scoring.js'

describe('scoreFor', () => {
  it('keeps standard rounds at one point and bonus rounds at two', () => {
    expect(scoreFor('STANDARD', 'WIN')).toBe(1)
    expect(scoreFor('STANDARD', 'LOSS')).toBe(-1)
    expect(scoreFor('DOUBLE_DOWN', 'WIN')).toBe(2)
    expect(scoreFor('DOUBLE_DOWN', 'LOSS')).toBe(-2)
    expect(scoreFor('STANDARD', 'WIN') + scoreFor('DOUBLE_DOWN', 'WIN')).toBe(3)
    expect(scoreFor('STANDARD', 'WIN') + scoreFor('DOUBLE_DOWN', 'LOSS')).toBe(-1)
  })
})
