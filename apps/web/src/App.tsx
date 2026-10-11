import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreatePlayerResponseSchema, MeResponseSchema, type MeResponse } from 'contracts'
import { useEffect, useRef, useState } from 'react'
import { HttpError, readJson } from './api'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { MarketCard } from './components/MarketCard'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
import { DoubleDownOffer } from './components/DoubleDownOffer'
import { OfferNotice } from './components/OfferNotice'
import { PredictionPanel } from './components/PredictionPanel'
import { RoundHistory } from './components/RoundHistory'
import { ScoreCard } from './components/ScoreCard'
import { StatusNotice } from './components/StatusNotice'
import { bonusResultAnnouncement, offerPhase, winOfferAnnouncement } from './offer'
import { announcement, pollInterval, roundView, clockOffset, type RoundPhase } from './round'
import { useOffer } from './useOffer'
import {
  clearSession,
  readSession,
  StorageUnavailableError,
  writeSession,
  type Session,
} from './session'
import { markSeenResult, shouldAnimate } from './seenResults'
import { useMarket } from './useMarket'
import { useHistory } from './useHistory'
import { usePrediction } from './usePrediction'

const SCORE_COPY = 'Your score is saved on our server. This browser remembers your anonymous player.'
const STORAGE_LIMIT =
  'Clearing this browser’s storage, or opening the game on another device, starts a new player. The old score stays on the server and cannot be opened from here.'
const TICKET_PHASES = new Set<RoundPhase>(['active', 'checking', 'equal', 'hold'])

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
    signal: AbortSignal.timeout(8_000),
  })
  return MeResponseSchema.parse(await readJson(response))
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
  const [live, setLive] = useState('')
  const [flash, setFlash] = useState<'win' | 'loss' | null>(null)
  const prevPhase = useRef<RoundPhase | null>(null)

  const player = useQuery({
    queryKey: ['player', baseUrl],
    enabled: baseUrl.length > 0 && !storageBlocked,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchIntervalInBackground: false,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      const offer = data.me.features.doubleDown ? data.me.offer : null
      const serverNow = Date.now() + data.offsetMs
      return pollInterval({
        hasActive: Boolean(data.me.activePrediction),
        dueAt: data.me.activePrediction?.dueAt,
        offsetMs: data.offsetMs,
        nowMs: Date.now(),
        waitReason: data.me.waitReason,
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
  const visibleOffer = me?.features.doubleDown ? me.offer : null
  const controls = useOffer(baseUrl, session, visibleOffer, serverNowMs, refreshPlayer)
  const phaseOffer = offerPhase(visibleOffer, controls, serverNowMs)
  const prediction = usePrediction(
    baseUrl,
    session,
    (outcome) => {
      if (outcome === 'rejected') controls.markReplacedHere(null)
      refreshPlayer()
    },
    refreshPlayer,
  )
  const rejected = player.error instanceof HttpError && player.error.status === 401
  const stalePlayer = Boolean(player.isError && player.data && !rejected)
  const market = useMarket(baseUrl)
  const view = roundView({
    me,
    placed: prediction.placed,
    submitPhase: prediction.phase,
    offsetMs: snapshot?.offsetMs ?? 0,
    nowMs,
  })
  const showPrediction = Boolean(me) && !view.active
  const relocateButtons = phaseOffer === 'open' || phaseOffer === 'submitting' || phaseOffer === 'expired' || phaseOffer === 'declined'
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
  const offerTiming = phaseOffer === 'open' || phaseOffer === 'submitting'
  useEffect(() => {
    if (!activeId && !offerTiming) return
    const id = window.setInterval(() => setNowMs(Date.now()), offerTiming && !activeId ? 100 : 1_000)
    return () => window.clearInterval(id)
  }, [activeId, offerTiming])

  useEffect(() => {
    const from = prevPhase.current
    prevPhase.current = view.phase
    if (view.phase === 'result' && from && TICKET_PHASES.has(from)) {
      document.getElementById('receipt-heading')?.focus()
    }
    if (view.phase === 'result' && me && view.settled?.outcome && view.settled.predictionId) {
      const predictionId = view.settled.predictionId
      const outcome = view.settled.outcome
      if (!shouldAnimate(me.playerId, predictionId)) return
      setFlash(outcome === 'WIN' ? 'win' : 'loss')
      if (view.settled.mode === 'DOUBLE_DOWN') setLive(bonusResultAnnouncement(outcome, me.score))
      else if (outcome === 'WIN' && phaseOffer === 'open') setLive(winOfferAnnouncement(me.score, view.settled.direction))
      else setLive(announcement(from, 'result', { outcome, score: me.score }) ?? '')
      const timer = window.setTimeout(() => markSeenResult(me.playerId, predictionId), 0)
      return () => window.clearTimeout(timer)
    }
    const text = announcement(from, view.phase, {
      direction: view.active?.direction,
      entryPrice: view.active?.entryPrice,
    })
    if (text) setLive(text)
  }, [view.phase, view.settled, view.active, me, phaseOffer])

  const prevOfferPhase = useRef(phaseOffer)
  const prevExpiry = useRef(visibleOffer?.expiresAt ?? null)
  const announcedBonus = useRef<string | null>(null)
  const focusTitle = useRef(false)
  useEffect(() => {
    if (phaseOffer === 'expired' && prevOfferPhase.current === 'open') {
      setLive('Double down offer ended. Your +1 is kept.')
    }
    if (phaseOffer === 'declined' && focusTitle.current) {
      focusTitle.current = false
      document.getElementById('play-title')?.focus()
    }
    prevOfferPhase.current = phaseOffer
  }, [phaseOffer])
  useEffect(() => {
    const expiry = visibleOffer?.expiresAt ?? null
    if (prevExpiry.current && expiry && expiry !== prevExpiry.current && phaseOffer === 'open') {
      const seconds = Math.max(0, Math.ceil((new Date(expiry).getTime() - serverNowMs) / 1000))
      setLive(`20 seconds added. Offer ends in ${seconds} seconds.`)
    }
    prevExpiry.current = expiry
  }, [visibleOffer?.expiresAt, phaseOffer, serverNowMs])
  useEffect(() => {
    const active = view.active
    if (active?.mode !== 'DOUBLE_DOWN' || !controls.acceptedHereOfferId) return
    if (announcedBonus.current === active.predictionId) return
    announcedBonus.current = active.predictionId
    const word = active.direction === 'DOWN' ? 'down' : 'up'
    setLive(`Bonus round started: ${word}, entry price ${active.entryPrice}. Plus 2 if right, minus 2 if wrong. The earliest result is in 60 seconds.`)
  }, [view.active, controls.acceptedHereOfferId])

  const ticketState =
    view.phase === 'equal' ? 'EQUAL_PRICE'
    : view.phase === 'hold' ? 'PROVIDER_HOLD'
    : view.phase === 'checking' ? 'CHECKING_PRICE'
    : 'WAITING_FOR_DEADLINE'

  return (
    <>
      <AppHeader score={me?.score ?? null} playerId={me?.playerId} stale={stalePlayer} />
      <div className="sr-only" aria-live="polite">{live}</div>
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
                showPrediction={showPrediction && !relocateButtons}
                onPredict={(direction) => {
                  if (visibleOffer && (phaseOffer === 'open' || phaseOffer === 'submitting')) {
                    controls.markReplacedHere(visibleOffer.offerId)
                  }
                  prediction.submit(direction, market.price)
                }}
                isSubmitting={prediction.phase === 'recording'}
                predictionDisabled={buttonsDisabled}
                predictionReason={buttonReason}
                predictionTitle={offerTiming ? 'Nice call. Bonus round?' : undefined}
              />
            )}
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
                predictionId={view.settled.predictionId}
                scoreDelta={view.settled.scoreDelta}
                parent={view.settled.parent}
              />
            )}
            {visibleOffer && (phaseOffer === 'open' || phaseOffer === 'submitting') && (
              <DoubleDownOffer
                offer={visibleOffer}
                serverNowMs={serverNowMs}
                submitting={phaseOffer === 'submitting'}
                error={controls.error}
                busy={buttonsDisabled}
                onAccept={() => void controls.accept()}
                onDecline={() => {
                  focusTitle.current = true
                  void controls.decline()
                }}
                onExtend={() => void controls.extend()}
              />
            )}
            {visibleOffer && phaseOffer === 'expired' && (
              <OfferNotice
                tone="neutral"
                icon="clock"
                message={<><b>Offer ended. Your +1 is kept.</b> Pick Up or Down whenever you're ready for a normal round.</>}
                onDismiss={() => controls.dismiss(visibleOffer.offerId)}
              />
            )}
            {visibleOffer && phaseOffer === 'declined' && (
              <OfferNotice
                tone="neutral"
                icon="check"
                message={<><b>No bonus round. Your +1 is kept.</b> Pick Up or Down whenever you're ready.</>}
                onDismiss={() => controls.dismiss(visibleOffer.offerId)}
              />
            )}
            {relocateButtons && (
              <PredictionPanel
                price={market.price}
                title={offerTiming ? 'Nice call. Bonus round?' : undefined}
                onPredict={(direction) => {
                  if (visibleOffer) controls.markReplacedHere(visibleOffer.offerId)
                  prediction.submit(direction, market.price)
                }}
                isSubmitting={prediction.phase === 'recording'}
                disabled={buttonsDisabled}
                reason={buttonReason}
              />
            )}
            {visibleOffer && phaseOffer === 'used' && (
              <OfferNotice
                tone="info"
                icon="ban"
                message={<><b>Offer no longer available.</b> You already doubled down on round {visibleOffer.parentPredictionId.slice(-6).toUpperCase()} in another tab. Your +1 is kept, and that bonus round is the one you see here.</>}
                onDismiss={() => controls.dismiss(visibleOffer.offerId)}
              />
            )}
            {visibleOffer && phaseOffer === 'replaced' && (
              <OfferNotice
                tone="info"
                icon="copy"
                message={<><b>Offer no longer available.</b> A new round was started in another tab, which ended the Double Down offer for round {visibleOffer.parentPredictionId.slice(-6).toUpperCase()}. Your +1 is kept.</>}
                onDismiss={() => controls.dismiss(visibleOffer.offerId)}
              />
            )}
            {view.active && (
              <RoundTicket
                key={view.active.predictionId}
                direction={view.active.direction}
                entryPrice={view.active.entryPrice}
                entryTime={new Date(view.active.entryTradeTime)}
                deadline={new Date(view.active.dueAt)}
                predictionId={view.active.predictionId}
                state={ticketState}
                secondsRemaining={view.remaining}
                latestPrice={market.price ?? undefined}
                bonus={view.active.mode === 'DOUBLE_DOWN'}
                parentPredictionId={view.active.parentPredictionId}
                autoFocus={
                  prediction.placed?.predictionId === view.active.predictionId
                  || visibleOffer?.bonusPredictionId === view.active.predictionId
                }
                note={
                  prediction.serverPriced
                    ? 'The server recorded its own entry price.'
                    : undefined
                }
              />
            )}
            {prediction.notice && prediction.notice !== 'Recording entry' && view.phase !== 'active' && view.phase !== 'checking' && view.phase !== 'equal' && view.phase !== 'hold' && (
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
            {baseUrl && !storageBlocked && player.isPending && !me && (
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
            {baseUrl && !storageBlocked && player.isError && !rejected && !me && (
              <StatusNotice
                kind="error"
                message="Could not reach the server."
                detail="Your saved player is still in this browser."
                action={{ label: 'Retry', onClick: () => void player.refetch() }}
              />
            )}
            {stalePlayer && (
              <StatusNotice
                kind="warn"
                message="Could not refresh your player."
                detail="Showing the last confirmed score."
                action={{ label: 'Retry', onClick: () => void player.refetch() }}
              />
            )}
          </div>
          <div className="col">
            {me && (
              <ScoreCard
                score={me.score}
                wins={me.wins}
                losses={me.losses}
                flash={flash}
                stale={stalePlayer}
              />
            )}
            {baseUrl && !storageBlocked && (
              <RoundHistory
                status={history.status}
                predictions={history.predictions}
                hasMore={history.hasMore}
                loadingMore={history.loadingMore}
                pageError={history.pageError}
                onLoadMore={history.loadMore}
                onRetry={history.retry}
              />
            )}
            <HowItWorks doubleDown={Boolean(me?.features.doubleDown)} />
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
