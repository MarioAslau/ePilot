import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { fetchHistory } from './predictions'
import { readSession } from './session'
import { historyRound, type HistoryRound } from './state/history'

export function useHistory(baseUrl: string, playerId: string | null, latestResolvedId: string | null) {
  const queryClient = useQueryClient()
  const seen = useRef<{ playerId: string; latestResolvedId: string | null } | null>(null)

  const history = useInfiniteQuery({
    queryKey: ['history', baseUrl, playerId],
    enabled: Boolean(baseUrl && playerId),
    initialPageParam: null as string | null,
    retry: false,
    queryFn: ({ pageParam }) => {
      const session = readSession()
      if (!session) throw new Error('missing session')
      return fetchHistory(baseUrl, session, pageParam)
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })

  useEffect(() => {
    if (!playerId) return
    const previous = seen.current
    if (!previous || previous.playerId !== playerId) {
      seen.current = { playerId, latestResolvedId }
      return
    }
    if (previous.latestResolvedId === latestResolvedId) return
    seen.current = { playerId, latestResolvedId }
    void queryClient.invalidateQueries({ queryKey: ['history', baseUrl, playerId] })
  }, [baseUrl, latestResolvedId, playerId, queryClient])

  const predictions = (history.data?.pages.flatMap((page) => page.predictions) ?? [])
    .map(historyRound)
    .filter((row): row is HistoryRound => row !== null)

  return {
    status: !playerId || history.isPending
      ? 'loading' as const
      : history.isError && predictions.length === 0
        ? 'error' as const
        : 'ready' as const,
    predictions,
    hasMore: Boolean(history.hasNextPage),
    loadingMore: history.isFetchingNextPage,
    pageError: history.isFetchNextPageError || (history.isError && predictions.length > 0),
    loadMore: () => {
      void history.fetchNextPage()
    },
    retry: () => {
      if (history.isFetchNextPageError) void history.fetchNextPage()
      else void history.refetch()
    },
  }
}
