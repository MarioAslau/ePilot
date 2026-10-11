import { describe, expect, it, vi } from 'vitest'
import { ErrorResponseSchema, MarketResponseSchema } from 'contracts'
import { ProviderUnavailableError, type TickerQuote } from '../coinbase.js'
import { handleMarket } from './market.js'

const now = new Date('2026-10-11T14:00:00.000Z')

function quote(tradeTime: string): TickerQuote {
  return {
    price: '65432.10',
    tradeTime,
    fetchedAt: '2026-10-11T13:59:59.000Z',
  }
}

describe('handleMarket', () => {
  it('returns a fresh Coinbase quote', async () => {
    const response = await handleMarket('req-1', {
      now: () => now,
      quote: async () => quote('2026-10-11T13:59:00.000Z'),
    })
    const body = MarketResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.source).toBe('COINBASE_EXCHANGE')
    expect(body.isFresh).toBe(true)
  })

  it('marks a trade older than 60 seconds as not fresh', async () => {
    const response = await handleMarket('req-2', {
      now: () => now,
      quote: async () => quote('2026-10-11T13:58:59.000Z'),
    })
    const body = MarketResponseSchema.parse(JSON.parse(response.body))

    expect(body.isFresh).toBe(false)
  })

  it('returns PROVIDER_UNAVAILABLE when the ticker fails', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const response = await handleMarket('req-3', {
      now: () => now,
      quote: async () => {
        throw new ProviderUnavailableError('timeout')
      },
    })
    const body = ErrorResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(503)
    expect(body).toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
      requestId: 'req-3',
    })
  })
})