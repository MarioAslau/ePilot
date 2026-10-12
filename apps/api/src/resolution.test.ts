import { describe, expect, it } from 'vitest'
import type { TickerQuote } from './coinbase.js'
import { decide } from './resolution.js'

const createdAt = '2026-10-11T15:00:00.000Z'
const dueAt = '2026-10-11T15:01:00.000Z'
const prediction = {
  createdAt,
  dueAt,
  direction: 'UP' as const,
  entryPrice: '65000.10',
  mode: 'STANDARD' as const,
}

function quote(price: string, tradeTime: string): TickerQuote {
  return {
    price,
    tradeTime,
    fetchedAt: '2026-10-11T15:01:02.000Z',
  }
}

describe('decide', () => {
  it('is too early before the deadline without a quote', () => {
    expect(decide(prediction, new Date('2026-10-11T15:00:59.999Z')).status).toBe('TOO_EARLY')
  })

  it('is too early when the exchange trade itself is inside the minute', () => {
    expect(
      decide(prediction, new Date('2026-10-11T15:01:05.000Z'), quote('65000.20', '2026-10-11T15:00:58.000Z')).status,
    ).toBe('TOO_EARLY')
  })

  it('treats equal decimal strings as an equal price', () => {
    expect(
      decide(prediction, new Date(dueAt), quote('65000.1', '2026-10-11T15:01:01.000Z')).status,
    ).toBe('EQUAL_PRICE')
  })

  it('scores up and down from the price move', () => {
    const at = new Date('2026-10-11T15:01:05.000Z')
    const trade = '2026-10-11T15:01:04.000Z'
    expect(decide(prediction, at, quote('65000.20', trade))).toMatchObject({ status: 'RESOLVED', outcome: 'WIN', scoreDelta: 1 })
    expect(decide(prediction, at, quote('65000.00', trade))).toMatchObject({ status: 'RESOLVED', outcome: 'LOSS', scoreDelta: -1 })
    expect(decide({ ...prediction, direction: 'DOWN' }, at, quote('65000.00', trade))).toMatchObject({ outcome: 'WIN', scoreDelta: 1 })
    expect(decide({ ...prediction, direction: 'DOWN' }, at, quote('65000.20', trade))).toMatchObject({ outcome: 'LOSS', scoreDelta: -1 })
  })

  it('holds when the quote is missing or the trade is stale', () => {
    const at = new Date('2026-10-11T15:01:30.000Z')
    expect(decide(prediction, at).status).toBe('PROVIDER_HOLD')
    expect(decide(prediction, at, quote('65000.20', '2026-10-11T15:01:00.000Z')).status).toBe('PROVIDER_HOLD')
  })
})
