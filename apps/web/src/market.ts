import { MarketRecentResponseSchema, MarketResponseSchema, type MarketResponse } from 'contracts'
import { readJson } from './api'
import { sampleAt, type PriceSample } from './chart/samples'

/** Poll every 2 s while a round is running or just settled, otherwise every 5 s. */
export const MARKET_POLL_MS = { fast: 2_000, normal: 5_000 } as const
const STALE_AFTER_MS = 15_000

/** 2 s until `fastUntil` (an active round, or just after it settles), 5 s otherwise. Both are server times. */
export function marketPollMs(serverNow: number, fastUntil: number): number {
  return serverNow < fastUntil ? MARKET_POLL_MS.fast : MARKET_POLL_MS.normal
}
/** How far back the chart asks for samples it missed. */
export const BACKFILL_SECONDS = 180

export async function fetchMarket(baseUrl: string): Promise<MarketResponse> {
  const response = await fetch(`${baseUrl}/market`)
  return MarketResponseSchema.parse(await readJson(response))
}

export async function fetchMarketRecent(baseUrl: string): Promise<PriceSample[]> {
  const response = await fetch(`${baseUrl}/market/recent?seconds=${BACKFILL_SECONDS}`)
  const body = MarketRecentResponseSchema.parse(await readJson(response))
  return body.samples.map((sample) => sampleAt(sample.price, sample.tradeTime))
}

export type FeedStatus = 'loading' | 'live' | 'stale' | 'unavailable'

export function feedStatus(input: {
  lastGood: { receivedAt: number; isFresh: boolean } | null
  errored: boolean
  now: number
}): FeedStatus {
  if (!input.lastGood) return input.errored ? 'unavailable' : 'loading'
  const age = input.now - input.lastGood.receivedAt
  if (input.errored || !input.lastGood.isFresh || age > STALE_AFTER_MS) return 'stale'
  return 'live'
}
