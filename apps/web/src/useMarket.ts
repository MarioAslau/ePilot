import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import {
  appendSample,
  feedStatus,
  fetchMarket,
  MARKET_POLL_MS,
  type PriceSample,
} from './market'

export function useMarket(baseUrl: string) {
  const [now, setNow] = useState(() => Date.now())
  const [samples, setSamples] = useState<PriceSample[]>([])
  const [lastGood, setLastGood] = useState<{
    price: string
    isFresh: boolean
    receivedAt: number
  } | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])

  const market = useQuery({
    queryKey: ['market', baseUrl],
    enabled: baseUrl.length > 0,
    retry: 0,
    staleTime: 0,
    refetchInterval: MARKET_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: () => fetchMarket(baseUrl),
  })

  useEffect(() => {
    if (!market.data) return
    const receivedAt = Date.now()
    setLastGood({
      price: market.data.price,
      isFresh: market.data.isFresh,
      receivedAt,
    })
    setSamples((current) => appendSample(current, market.data, receivedAt))
  }, [market.data, market.dataUpdatedAt])

  const errored = market.isError
  const status = feedStatus({
    lastGood,
    errored,
    now,
  })

  return {
    price: lastGood?.price ?? null,
    status: baseUrl.length > 0 ? status : 'loading',
    samples,
    now,
    ageSeconds: lastGood ? Math.max(0, Math.floor((now - lastGood.receivedAt) / 1000)) : undefined,
    errored,
    refetch: market.refetch,
  }
}
