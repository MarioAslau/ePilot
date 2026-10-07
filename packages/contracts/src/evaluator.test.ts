import { describe, expect, it } from 'vitest'
import { evaluate } from './evaluator.js'

const createdAt = '2026-10-06T14:00:00.000Z'

function at(offsetMs: number): string {
  return new Date(Date.parse(createdAt) + offsetMs).toISOString()
}

const base = {
  direction: 'UP' as const,
  entryPrice: '65432.10',
  resolutionPrice: '65901.33',
  createdAt,
  resolvedAt: at(60_000),
}

describe('evaluate', () => {
  it('scores an UP win as +1', () => {
    expect(evaluate({ ...base, direction: 'UP', resolutionPrice: '65901.33' })).toEqual({
      status: 'RESOLVED',
      outcome: 'WIN',
      scoreDelta: 1,
    })
  })

  it('scores an UP loss as -1', () => {
    expect(evaluate({ ...base, direction: 'UP', resolutionPrice: '64990.01' })).toEqual({
      status: 'RESOLVED',
      outcome: 'LOSS',
      scoreDelta: -1,
    })
  })

  it('scores a DOWN win as +1', () => {
    expect(evaluate({ ...base, direction: 'DOWN', resolutionPrice: '64990.01' })).toEqual({
      status: 'RESOLVED',
      outcome: 'WIN',
      scoreDelta: 1,
    })
  })

  it('scores a DOWN loss as -1', () => {
    expect(evaluate({ ...base, direction: 'DOWN', resolutionPrice: '65901.33' })).toEqual({
      status: 'RESOLVED',
      outcome: 'LOSS',
      scoreDelta: -1,
    })
  })

  it('does not settle before 60 seconds, even if the price has moved', () => {
    expect(evaluate({ ...base, resolvedAt: at(59_999) })).toEqual({ status: 'TOO_EARLY' })
  })

  it('is eligible at the deadline', () => {
    expect(evaluate({ ...base, resolvedAt: at(60_000) }).status).toBe('RESOLVED')
  })

  it('stays pending when the prices are equal', () => {
    expect(
      evaluate({ ...base, resolutionPrice: '65432.10' }),
    ).toEqual({ status: 'EQUAL_PRICE' })
  })

  it('treats trailing zeros as the same price', () => {
    expect(
      evaluate({ ...base, entryPrice: '65432.10', resolutionPrice: '65432.1' }),
    ).toEqual({ status: 'EQUAL_PRICE' })
  })
})
