import { describe, expect, it } from 'vitest'
import { runningScores, scoreSeries } from '../state/history'

describe('runningScores', () => {
  it('gives the newest row the current score', () => {
    expect(runningScores(2, [1, -1])).toEqual([2, 1])
  })

  it('walks only the listed deltas when history is truncated', () => {
    expect(runningScores(5, [1, 1])).toEqual([5, 4])
  })

  it('gives each round of a pair its own score', () => {
    // Newest is a +4 redemption, then the −1 it followed. Current score is 3.
    expect(runningScores(3, [4, -1])).toEqual([3, -1])
    // Newest is a +2 double down, then the +1 it followed. Current score is 3.
    expect(runningScores(3, [2, 1])).toEqual([3, 1])
  })
})

describe('scoreSeries', () => {
  it('starts from the score before the oldest listed round', () => {
    expect(scoreSeries(2, [1, -1])).toEqual([2, 1, 2])
  })

  it('starts from current minus the listed deltas when the page is truncated', () => {
    expect(scoreSeries(5, [1, 1])).toEqual([3, 4, 5])
  })

  it('steps through a redemption pair oldest first', () => {
    expect(scoreSeries(3, [4, -1])).toEqual([0, -1, 3])
  })
})
