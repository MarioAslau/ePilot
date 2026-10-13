import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { mergeSamples, sampleAt, type PriceSample } from './chart/samples'
import { feedStatus, fetchMarket, fetchMarketRecent, MARKET_POLL_MS, marketPollMs } from './market'

/** Ask for a backfill when the newest sample is older than this. */
const GAP_MS = 15_000

/**
 * The display price, its feed status, and the chart's samples on the server clock.
 * `offsetMs` is the `/me` clock offset; `fastUntil` is the server time until which polling stays at 2 s.
 */
export function useMarket(baseUrl: string, { offsetMs = 0, fastUntil = 0 }: { offsetMs?: number; fastUntil?: number } = {}) {
  const enabled = baseUrl.length > 0
  const [clientNow, setClientNow] = useState(() => Date.now())
  const [samples, setSamples] = useState<PriceSample[]>([])
  const [lastGood, setLastGood] = useState<{
    price: string
    isFresh: boolean
    receivedAt: number
  } | null>(null)
  const serverNow = clientNow + offsetMs
  const pollMs = useRef<number>(MARKET_POLL_MS.normal)
  pollMs.current = marketPollMs(serverNow, fastUntil)

  useEffect(() => {
    const timer = setInterval(() => setClientNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  const market = useQuery({
    queryKey: ['market', baseUrl],
    enabled,
    retry: 0,
    staleTime: 0,
    refetchInterval: () => pollMs.current,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: () => fetchMarket(baseUrl),
  })

  // Loads on mount and on focus. A gap in the live feed refetches it below.
  const recent = useQuery({
    queryKey: ['market-recent', baseUrl],
    enabled,
    retry: 0,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: () => fetchMarketRecent(baseUrl),
  })

  useEffect(() => {
    if (!market.data) return
    const quote = market.data
    setLastGood({ price: quote.price, isFresh: quote.isFresh, receivedAt: Date.now() })
    if (quote.isFresh) setSamples((current) => mergeSamples(current, [sampleAt(quote.price, quote.tradeTime)]))
  }, [market.data, market.dataUpdatedAt])

  useEffect(() => {
    if (!recent.data) return
    setSamples((current) => mergeSamples(current, recent.data))
  }, [recent.data, recent.dataUpdatedAt])

  const newest = samples[samples.length - 1]?.time
  const gap = enabled && newest !== undefined && serverNow - newest > GAP_MS
  const lastBackfill = recent.dataUpdatedAt || recent.errorUpdatedAt
  const { refetch: refetchRecent, isFetching: backfilling } = recent
  useEffect(() => {
    if (gap && !backfilling && clientNow - lastBackfill > GAP_MS) void refetchRecent()
  }, [gap, backfilling, clientNow, lastBackfill, refetchRecent])

  const errored = market.isError
  return {
    price: lastGood?.price ?? null,
    status: enabled ? feedStatus({ lastGood, errored, now: clientNow }) : 'loading',
    samples,
    /** Server time, ticking once a second. */
    now: serverNow,
    ageSeconds: lastGood ? Math.max(0, Math.floor((clientNow - lastGood.receivedAt) / 1000)) : undefined,
    errored,
    refetch: market.refetch,
  }
}
