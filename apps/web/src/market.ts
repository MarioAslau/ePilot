import { MarketResponseSchema, type MarketResponse } from 'contracts'
import { readJson } from './api'

export const MARKET_POLL_MS = 5_000
const STALE_AFTER_MS = 15_000
const SAMPLE_WINDOW_MS = 10 * 60 * 1000

export interface PriceSample {
  price: string
  tradeTime: string
  receivedAt: number
}

export async function fetchMarket(baseUrl: string): Promise<MarketResponse> {
  const response = await fetch(`${baseUrl}/market`)
  return MarketResponseSchema.parse(await readJson(response))
}

export function feedStatus(input: {
  lastGood: { receivedAt: number; isFresh: boolean } | null
  errored: boolean
  now: number
}): 'loading' | 'live' | 'stale' | 'unavailable' {
  if (!input.lastGood) return input.errored ? 'unavailable' : 'loading'
  const age = input.now - input.lastGood.receivedAt
  if (input.errored || !input.lastGood.isFresh || age > STALE_AFTER_MS) return 'stale'
  return 'live'
}

export function appendSample(
  samples: PriceSample[],
  quote: { price: string; tradeTime: string; isFresh: boolean },
  receivedAt: number,
): PriceSample[] {
  const recent = samples.filter((sample) => receivedAt - sample.receivedAt <= SAMPLE_WINDOW_MS)
  if (!quote.isFresh || recent.some((sample) => sample.tradeTime === quote.tradeTime)) {
    return recent
  }
  return [...recent, { price: quote.price, tradeTime: quote.tradeTime, receivedAt }]
}

export function chartSummary(samples: PriceSample[], now: number): {
  coverageSeconds: number
  change1m: number | null
} {
  const oldest = samples[0]
  const newest = samples[samples.length - 1]
  if (!oldest || !newest) return { coverageSeconds: 0, change1m: null }
  const coverageSeconds = Math.max(0, Math.round((newest.receivedAt - oldest.receivedAt) / 1000))
  const baseline = samples.find((sample) => now - sample.receivedAt >= 60_000)
  if (!baseline) return { coverageSeconds, change1m: null }
  return {
    coverageSeconds,
    change1m: Number(newest.price) - Number(baseline.price),
  }
}
