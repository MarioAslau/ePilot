import { describe, expect, it, vi } from 'vitest'
import { ErrorResponseSchema, MarketRecentResponseSchema } from 'contracts'
import { ProviderUnavailableError, recentSamples, type TradeSample } from '../coinbase.js'
import { handleMarketRecent } from './marketRecent.js'

const now = new Date('2026-10-11T14:00:00.000Z')
const at = (ms: number) => new Date(now.getTime() - ms).toISOString()
const trade = (msAgo: number, price: string): TradeSample => ({ price, tradeTime: at(msAgo) })

describe('recentSamples', () => {
  it('keeps the last trade of each second, oldest first, within the window', () => {
    // Coinbase order: newest first.
    const trades = [trade(100, '3'), trade(400, '2'), trade(1_200, '1'), trade(200_000, '0')]
    const { samples, coveredSeconds } = recentSamples(trades, 180, now)

    expect(samples.map((sample) => sample.price)).toEqual(['1', '3'])
    expect(coveredSeconds).toBe(200)
  })

  it('reports zero coverage when there are no trades', () => {
    expect(recentSamples([], 180, now)).toEqual({ samples: [], coveredSeconds: 0 })
  })
})

describe('handleMarketRecent', () => {
  it('returns bucketed samples and logs the coverage', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await handleMarketRecent({ seconds: '60' }, 'req-1', {
      now: () => now,
      trades: async () => [trade(1_000, '65000.10'), trade(90_000, '64990.00')],
    })
    const body = MarketRecentResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.samples).toEqual([{ price: '65000.10', tradeTime: at(1_000) }])
    expect(body.coveredSeconds).toBe(90)
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"coveredSeconds":90'))
  })

  it.each([{ seconds: '0' }, { seconds: '601' }, { seconds: '1.5' }, { seconds: 'x' }])(
    'rejects seconds=%o',
    async (query) => {
      const response = await handleMarketRecent(query, 'req-2', { now: () => now, trades: async () => [] })
      expect(response.statusCode).toBe(400)
      expect(ErrorResponseSchema.parse(JSON.parse(response.body)).code).toBe('INVALID_INPUT')
    },
  )

  it('defaults to 180 seconds', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await handleMarketRecent(undefined, 'req-3', {
      now: () => now,
      trades: async () => [trade(179_000, '1'), trade(181_000, '2')],
    })
    expect(MarketRecentResponseSchema.parse(JSON.parse(response.body)).samples).toHaveLength(1)
  })

  it('returns PROVIDER_UNAVAILABLE when the trades call fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await handleMarketRecent({}, 'req-4', {
      now: () => now,
      trades: async () => {
        throw new ProviderUnavailableError('timeout')
      },
    })
    expect(response.statusCode).toBe(503)
    expect(ErrorResponseSchema.parse(JSON.parse(response.body)).code).toBe('PROVIDER_UNAVAILABLE')
  })
})
