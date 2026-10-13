import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { WELCOME_BACK } from './announcements'
import { createPlayer, fetchMe, HttpError } from './api'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { LedgerCard } from './components/LedgerCard'
import { MarketCard } from './components/MarketCard'
import { OfferSlot } from './components/OfferSlot'
import { PlayerNotice, playerProblem } from './components/PlayerNotice'
import { PredictionPanel } from './components/PredictionPanel'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
import { StatusNotice } from './components/StatusNotice'
import { offerPhase, offerSlot } from './offer'
import { clockOffset, ledgerPhase, pollInterval, roundView, TICKET_PHASES } from './round'
import { clearSession, readSession, StorageUnavailableError, writeSession } from './session'
import { useAnnouncer } from './useAnnouncer'
import { useHistory } from './useHistory'
import { useMarket } from './useMarket'
import { useOffer } from './useOffer'
import { usePrediction } from './usePrediction'

/** The chart keeps polling every 2 s this long after a round settles. */
const FAST_AFTER_SETTLE_MS = 10_000

const SCORE_COPY = 'Your score is saved on our server. This browser remembers your anonymous player.'
const STORAGE_LIMIT =
  'Clearing this browser’s storage, or opening the game on another device, starts a new player. The old score stays on the server and cannot be opened from here.'

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
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
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const { offer, activePrediction, waitReason } = data.me
      const serverNow = Date.now() + data.offsetMs
      return pollInterval({
        activeDueAt: activePrediction?.dueAt ?? null,
        offsetMs: data.offsetMs,
        nowMs: Date.now(),
        waitReason,
        offerOpen: Boolean(offer && offer.status === 'OPEN' && serverNow < new Date(offer.expiresAt).getTime()),
      })
    },
    queryFn: async () => {
      const startedAt = Date.now()
      const existing = readSession()
      const me = existing
        ? await fetchMe(baseUrl, existing)
        : await createPlayer(baseUrl).then((created) => {
            writeSession(created)
            return fetchMe(baseUrl, created)
          })
      return { me, offsetMs: clockOffset(me.serverTime, startedAt, Date.now()) }
    },
  })

  const snapshot = player.data
  const me = snapshot?.me
  const session = me ? readSession() : null
  const history = useHistory(
    baseUrl,
    session?.playerId ?? null,
    me?.latestResolvedPrediction?.predictionId ?? null,
  )
  const refreshPlayer = () => {
    void queryClient.invalidateQueries({ queryKey: ['player', baseUrl] })
  }
  const serverNowMs = nowMs + (snapshot?.offsetMs ?? 0)
  // The server only sends an offer whose mode is enabled.
  const offer = me?.offer ?? null
  const controls = useOffer(baseUrl, session, offer, serverNowMs, refreshPlayer)
  const phaseOffer = offerPhase(offer, controls, serverNowMs)
  const slot = offerSlot(phaseOffer)
  const prediction = usePrediction(
    baseUrl,
    session,
    (outcome) => {
      if (outcome === 'rejected') controls.markReplacedHere(null)
      refreshPlayer()
    },
    refreshPlayer,
  )
  const problem = playerProblem({
    configured: baseUrl.length > 0,
    storageBlocked,
    pending: player.isPending,
    errored: player.isError,
    rejected: player.error instanceof HttpError && player.error.status === 401,
    hasPlayer: Boolean(me),
  })
  const stalePlayer = problem === 'stale'
  const view = roundView({
    me,
    placed: prediction.placed,
    submitPhase: prediction.phase,
    offsetMs: snapshot?.offsetMs ?? 0,
    nowMs,
  })
  const market = useMarket(baseUrl, {
    offsetMs: snapshot?.offsetMs ?? 0,
    fastUntil: view.active
      ? Infinity
      : view.settled?.resolvedAt ? Date.parse(view.settled.resolvedAt) + FAST_AFTER_SETTLE_MS : 0,
  })
  // While an offer is open or just ended, the play area offers "Go again?" alongside it.
  const offerInPlay = slot === 'live' || slot === 'ended'
  const marketLive = market.status === 'live'
  const buttonsDisabled = !marketLive || stalePlayer || prediction.phase !== 'idle' || controls.mutation !== null
  const buttonReason = prediction.phase === 'recording'
    ? null
    : stalePlayer
      ? 'Reconnecting to your player'
      : !marketLive
        ? 'Waiting for a live price'
        : null

  const activeId = view.active?.predictionId
  const offerTicking = slot === 'live'
  useEffect(() => {
    if (!activeId && !offerTicking) return
    const id = window.setInterval(() => setNowMs(Date.now()), offerTicking && !activeId ? 100 : 1_000)
    return () => window.clearInterval(id)
  }, [activeId, offerTicking])

  const announcer = useAnnouncer({
    me,
    view,
    offer,
    offerPhase: phaseOffer,
    serverNowMs,
    acceptedHereOfferId: controls.acceptedHereOfferId,
  })
  const offerSlotProps = offer && phaseOffer
    ? {
        offer,
        phase: phaseOffer,
        controls,
        serverNowMs,
        busy: buttonsDisabled,
        onDecline: () => {
          announcer.focusTitleAfterDecline()
          void controls.decline()
        },
      }
    : null

  return (
    <>
      <AppHeader score={me?.score ?? null} playerId={me?.playerId} stale={stalePlayer} />
      <div className="sr-only" aria-live="polite">{announcer.live}</div>
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
                round={view.active ? {
                  direction: view.active.direction,
                  acceptedAt: new Date(view.active.entryTradeTime).getTime(),
                  earliestResolveAt: new Date(view.active.dueAt).getTime(),
                  entryPrice: view.active.entryPrice,
                } : undefined}
              >
                {view.active ? (
                  <>
                    {offerSlotProps && slot === 'elsewhere' && <OfferSlot {...offerSlotProps} />}
                    <RoundTicket
                      key={view.active.predictionId}
                      direction={view.active.direction}
                      entryPrice={view.active.entryPrice}
                      entryTime={new Date(view.active.entryTradeTime)}
                      deadline={new Date(view.active.dueAt)}
                      state={view.waitReason ?? undefined}
                      secondsRemaining={view.remaining}
                      latestPrice={market.price ?? undefined}
                      mode={view.active.mode}
                      autoFocus={
                        prediction.placed?.predictionId === view.active.predictionId
                        || offer?.bonusPredictionId === view.active.predictionId
                      }
                      checkedAgoSeconds={Math.max(0, Math.round((nowMs - player.dataUpdatedAt) / 1000))}
                      note={
                        prediction.serverPriced
                          ? 'The server recorded its own entry price.'
                          : undefined
                      }
                    />
                  </>
                ) : me ? (
                  <PredictionPanel
                    title={view.settled?.outcome || offerInPlay ? 'Go again?' : undefined}
                    subtitle={view.settled?.outcome || offerInPlay ? null : undefined}
                    onPredict={(direction) => {
                      if (offer && offerInPlay) controls.markReplacedHere(offer.offerId)
                      prediction.submit(direction, market.price)
                    }}
                    isSubmitting={prediction.phase === 'recording'}
                    disabled={buttonsDisabled}
                    reason={buttonReason}
                  >
                    {view.settled?.outcome && view.settled.resolutionPrice && view.settled.resolutionTradeTime && view.settled.resolvedAt && (
                      <ResultReceipt
                        outcome={view.settled.outcome}
                        direction={view.settled.direction}
                        entryPrice={view.settled.entryPrice}
                        resolutionPrice={view.settled.resolutionPrice}
                        entryTime={new Date(view.settled.entryTradeTime)}
                        resolutionTime={new Date(view.settled.resolutionTradeTime)}
                        fetchedAt={view.settled.resolutionFetchedAt ? new Date(view.settled.resolutionFetchedAt) : undefined}
                        settledAt={new Date(view.settled.resolvedAt)}
                        scoreDelta={view.settled.scoreDelta}
                        parent={view.settled.parent}
                        mode={view.settled.mode}
                      />
                    )}
                    {view.settled && view.settled.predictionId === announcer.welcomeBackId && (
                      <p className="fine">{WELCOME_BACK}</p>
                    )}
                    {offerSlotProps && <OfferSlot {...offerSlotProps} />}
                  </PredictionPanel>
                ) : null}
              </MarketCard>
            )}
            {prediction.notice && !TICKET_PHASES.has(view.phase) && (
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
            {problem && (
              <PlayerNotice
                problem={problem}
                onRetry={() => void player.refetch()}
                onStartOver={() => {
                  clearSession()
                  void player.refetch()
                }}
              />
            )}
          </div>
          <div className="col">
            {(me || (baseUrl && !storageBlocked)) && (
              <LedgerCard
                score={me?.score ?? 0}
                wins={me?.wins ?? 0}
                losses={me?.losses ?? 0}
                flash={announcer.flash}
                stale={stalePlayer}
                status={history.status}
                predictions={history.predictions}
                hasMore={history.hasMore}
                loadingMore={history.loadingMore}
                pageError={history.pageError}
                onLoadMore={history.loadMore}
                onRetry={history.retry}
                pending={view.active && view.waitReason && me ? {
                  direction: view.active.direction,
                  entryPrice: view.active.entryPrice,
                  entryTradeTime: view.active.entryTradeTime,
                  mode: view.active.mode,
                  phase: ledgerPhase(view.waitReason),
                  score: me.score,
                } : null}
              />
            )}
          </div>
        </div>
      </main>
      <HowItWorks doubleDown={Boolean(me?.features.doubleDown)} redemption={Boolean(me?.features.redemption)} />
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
