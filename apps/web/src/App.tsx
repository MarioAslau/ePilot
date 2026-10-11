import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreatePlayerResponseSchema, MeResponseSchema, type MeResponse } from 'contracts'
import { useEffect, useState } from 'react'
import { HttpError, readJson } from './api'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { MarketCard } from './components/MarketCard'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
import { StatusNotice } from './components/StatusNotice'
import {
  clearSession,
  readSession,
  StorageUnavailableError,
  writeSession,
  type Session,
} from './session'
import { useMarket } from './useMarket'
import { usePrediction } from './usePrediction'

const SCORE_COPY = 'Your score is saved on our server. This browser remembers your anonymous player.'
const STORAGE_LIMIT =
  'Clearing this browser’s storage, or opening the game on another device, starts a new player. The old score stays on the server and cannot be opened from here.'

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

async function createPlayer(baseUrl: string): Promise<Session> {
  const response = await fetch(`${baseUrl}/players`, { method: 'POST' })
  return CreatePlayerResponseSchema.parse(await readJson(response))
}

async function fetchMe(baseUrl: string, session: Session): Promise<MeResponse> {
  const response = await fetch(`${baseUrl}/me`, {
    headers: {
      Authorization: `Bearer ${session.playerId}.${session.accessToken}`,
    },
  })
  return MeResponseSchema.parse(await readJson(response))
}

function secondsRemaining(dueAt: string, serverTime: string, receivedAt: number, nowMs: number): number {
  const offset = new Date(serverTime).getTime() - receivedAt
  return Math.max(0, Math.ceil((new Date(dueAt).getTime() - (nowMs + offset)) / 1000))
}

function PlayerStatus() {
  const baseUrl = apiBaseUrl()
  const queryClient = useQueryClient()
  const [storageBlocked] = useState(() => {
    try {
      readSession()
      return false
    } catch (error) {
      return error instanceof StorageUnavailableError
    }
  })
  const [nowMs, setNowMs] = useState(() => Date.now())

  const player = useQuery({
    queryKey: ['player', baseUrl],
    enabled: baseUrl.length > 0 && !storageBlocked,
    retry: false,
    refetchInterval: (query) => (query.state.data?.me.activePrediction ? 2_000 : false),
    queryFn: async () => {
      const receivedAt = Date.now()
      const existing = readSession()
      const me = existing
        ? await fetchMe(baseUrl, existing)
        : await createPlayer(baseUrl).then((created) => {
            writeSession(created)
            return fetchMe(baseUrl, created)
          })
      return { me, receivedAt }
    },
  })

  const snapshot = player.data
  const me = snapshot?.me
  const session = me ? readSession() : null
  const prediction = usePrediction(baseUrl, session, () => {
    void queryClient.invalidateQueries({ queryKey: ['player', baseUrl] })
  })
  const rejected = player.error instanceof HttpError && player.error.status === 401
  const market = useMarket(baseUrl)
  const active =
    me?.activePrediction ??
    (prediction.placed && prediction.placed.predictionId !== me?.latestResolvedPrediction?.predictionId
      ? prediction.placed
      : null)
  const settled = !active ? me?.latestResolvedPrediction : null
  const remaining = active && me && snapshot
    ? secondsRemaining(active.dueAt, me.serverTime, snapshot.receivedAt, nowMs)
    : 0
  const reported = me?.waitReason
  const roundState = !active
    ? null
    : reported === 'EQUAL_PRICE' || reported === 'PROVIDER_HOLD'
      ? reported
      : remaining <= 0 || reported === 'CHECKING_PRICE'
        ? 'CHECKING_PRICE'
        : 'WAITING_FOR_DEADLINE'
  const showPrediction = Boolean(me) && !active && market.status === 'live'

  const activeId = active?.predictionId
  useEffect(() => {
    if (!activeId) return
    const id = window.setInterval(() => setNowMs(Date.now()), 1_000)
    return () => window.clearInterval(id)
  }, [activeId])

  return (
    <>
      <AppHeader score={me?.score ?? null} playerId={me?.playerId} />
      <main>
        <div className="layout">
          <div className="col">
            {baseUrl && (
              <MarketCard
                price={market.price}
                status={market.status}
                ageSeconds={market.ageSeconds}
                samples={market.samples}
                now={market.now}
                showPrediction={showPrediction}
                onPredict={(direction) => prediction.submit(direction, market.price)}
                isSubmitting={prediction.isSubmitting}
              />
            )}
            {settled?.outcome && settled.resolutionPrice && settled.resolutionTradeTime && settled.resolvedAt && (
              <ResultReceipt
                outcome={settled.outcome}
                direction={settled.direction}
                entryPrice={settled.entryPrice}
                resolutionPrice={settled.resolutionPrice}
                entryTime={new Date(settled.entryTradeTime)}
                resolutionTime={new Date(settled.resolutionTradeTime)}
                fetchedAt={settled.resolutionFetchedAt ? new Date(settled.resolutionFetchedAt) : undefined}
                settledAt={new Date(settled.resolvedAt)}
                predictionId={settled.predictionId}
              />
            )}
            {active && roundState && (
              <RoundTicket
                key={active.predictionId}
                direction={active.direction}
                entryPrice={active.entryPrice}
                entryTime={new Date(active.entryTradeTime)}
                deadline={new Date(active.dueAt)}
                predictionId={active.predictionId}
                state={roundState}
                secondsRemaining={remaining}
                note={
                  prediction.serverPriced
                    ? 'The server recorded its own entry price.'
                    : undefined
                }
              />
            )}
            {prediction.notice && prediction.notice !== 'Recording entry' && (
              <StatusNotice
                kind={prediction.phase === 'unknown' ? 'info' : 'error'}
                message={prediction.notice}
                action={
                  prediction.canRetry
                    ? { label: 'Retry', onClick: prediction.retry }
                    : undefined
                }
              />
            )}
            {market.price && market.errored && (
              <StatusNotice
                kind="warn"
                message="Price updates are delayed. Showing the last known price."
                action={{ label: 'Retry', onClick: () => void market.refetch() }}
              />
            )}
            {!baseUrl && (
              <StatusNotice
                kind="error"
                message="API address is not configured."
                detail="Set VITE_API_BASE_URL to the deployed API Gateway URL, then rebuild."
              />
            )}
            {baseUrl && storageBlocked && (
              <StatusNotice
                kind="error"
                message="This browser could not save your player."
              />
            )}
            {baseUrl && !storageBlocked && player.isPending && (
              <StatusNotice kind="info" message="Restoring your player…" />
            )}
            {baseUrl && !storageBlocked && player.isError && rejected && (
              <StatusNotice
                kind="error"
                message="This browser’s saved player was rejected."
                detail="The saved token does not match the server. Starting again creates a new player at score 0."
                action={{
                  label: 'Start a new player',
                  onClick: () => {
                    clearSession()
                    void player.refetch()
                  },
                }}
              />
            )}
            {baseUrl && !storageBlocked && player.isError && !rejected && (
              <StatusNotice
                kind="error"
                message="Could not reach the server."
                detail="Your saved player is still in this browser."
                action={{ label: 'Retry', onClick: () => void player.refetch() }}
              />
            )}
            {me && (
              <p className="label" aria-label={`Score: ${me.score}`}>
                Score <strong className="num">{me.score}</strong>
              </p>
            )}
          </div>
          <div className="col">
            <HowItWorks />
          </div>
        </div>
      </main>
    </>
  )
}

/**
 * Production shell. It creates or restores an anonymous player
 * and submits one pending prediction at a time.
 */
export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            staleTime: 5_000,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <div className="wrap">
        <PlayerStatus />
        <footer className="foot wrap">
          <p>Prices from Coinbase Exchange · Points only, no money involved.</p>
          <p>{SCORE_COPY}</p>
          <p>{STORAGE_LIMIT}</p>
        </footer>
      </div>
    </QueryClientProvider>
  )
}
