/**
 * Fixture preview runner — development only.
 *
 * Gate: only reachable when import.meta.env.DEV is true.
 * The dynamic import in main.tsx ensures this file is excluded from production builds.
 *
 * Usage: http://localhost:5173/?fixture=ready
 *        http://localhost:5173/?fixture=win
 *        (etc — see FixtureName)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { DirectionButtons } from './components/DirectionButtons'
import { DoubleDownOffer } from './components/DoubleDownOffer'
import { HowItWorks } from './components/HowItWorks'
import { OfferNotice } from './components/OfferNotice'
import { PredictionPanel } from './components/PredictionPanel'
import { MarketCard } from './components/MarketCard'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
import { RoundHistory } from './components/RoundHistory'
import { ScoreCard } from './components/ScoreCard'
import { StatusNotice } from './components/StatusNotice'
import { type FixtureName, FIXTURE_NAMES, fixtures } from './fixtures'

const qc = new QueryClient()

function getBannerFixture(): FixtureName {
  const p = new URLSearchParams(location.search).get('fixture') ?? 'ready'
  return (FIXTURE_NAMES.includes(p as FixtureName) ? p : 'ready') as FixtureName
}

function navigate(name: FixtureName) {
  const url = new URL(location.href)
  url.searchParams.set('fixture', name)
  history.pushState({}, '', url)
  // force re-read
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function FixtureApp() {
  const [current, setCurrent] = useState<FixtureName>(getBannerFixture)

  useEffect(() => {
    const handler = () => setCurrent(getBannerFixture())
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const state = fixtures[current]
  const offerPreview = state.offerPreview
  const relocate = offerPreview === 'open' || offerPreview === 'extended' || offerPreview === 'submitting' || offerPreview === 'expired' || offerPreview === 'declined'
  const sampleOffer = {
    offerId: 'o_p_0000000002000_ccccdddd',
    parentPredictionId: 'p_0000000002000_ccccdddd',
    direction: 'UP' as const,
    issuedAt: '2026-10-06T14:01:02.000Z',
    expiresAt: offerPreview === 'extended' ? '2026-10-06T14:01:42.000Z' : '2026-10-06T14:01:12.000Z',
    extensions: offerPreview === 'extended' ? 1 : 0,
    status: 'OPEN' as const,
  }

  return (
    <QueryClientProvider client={qc}>
      {/* PREVIEW banner — only rendered in dev fixture mode */}
      <div className="fixture-banner" role="banner">
        <span>PREVIEW</span>
        <nav aria-label="Fixture states">
          {FIXTURE_NAMES.map(name => (
            <a
              key={name}
              href={`?fixture=${name}`}
              className={name === current ? 'active' : ''}
              onClick={e => { e.preventDefault(); navigate(name) }}
            >
              {fixtures[name].label}
            </a>
          ))}
        </nav>
      </div>

      <div className="wrap fixture-has-banner">
        <AppHeader score={state.score} />

        <main>
          <div className="layout">
            {/* Left column */}
            <div className="col">
              <MarketCard
                price={state.price}
                status={state.priceStatus}
                isSubmitting={state.isSubmitting}
                showPrediction={!relocate && !state.activeRound}
                predictionTitle={offerPreview === 'open' || offerPreview === 'extended' ? 'Nice call. Bonus round?' : undefined}
              />

              {/* Active round ticket */}
              {state.activeRound && (
                <RoundTicket
                  direction={state.activeRound.direction}
                  entryPrice={state.activeRound.entryPrice}
                  entryTime={state.activeRound.entryTime}
                  deadline={state.activeRound.deadline}
                  predictionId={state.activeRound.predictionId}
                  state={state.activeRound.state}
                  secondsRemaining={state.activeRound.secondsRemaining}
                  latestPrice={state.price ?? undefined}
                  bonus={state.bonus}
                  parentPredictionId={state.bonus ? 'p_0000000002000_ccccdddd' : undefined}
                />
              )}

              {/* Standalone direction buttons for submitting state */}
              {state.isSubmitting && !state.activeRound && (
                <DirectionButtons disabled isSubmitting />
              )}

              {/* Settlement receipt */}
              {state.result && (
                <ResultReceipt
                  outcome={state.result.outcome}
                  direction={state.result.direction}
                  entryPrice={state.result.entryPrice}
                  resolutionPrice={state.result.resolutionPrice}
                  entryTime={state.result.entryTime}
                  resolutionTime={state.result.resolutionTime}
                  predictionId={state.result.predictionId}
                  scoreDelta={state.bonus ? (state.result.outcome === 'WIN' ? 2 : -2) : undefined}
                  parent={state.bonus ? { predictionId: 'p_0000000002000_ccccdddd', scoreDelta: 1 } : undefined}
                />
              )}
              {(offerPreview === 'open' || offerPreview === 'extended' || offerPreview === 'submitting') && (
                <div className={current === 'dd-reduced-motion' ? 'dd-force-pips' : undefined}>
                  <DoubleDownOffer
                    offer={sampleOffer}
                    serverNowMs={Date.parse('2026-10-06T14:01:05.000Z')}
                    submitting={offerPreview === 'submitting'}
                    error={null}
                    busy={offerPreview === 'submitting'}
                    onAccept={() => undefined}
                    onDecline={() => undefined}
                    onExtend={() => undefined}
                  />
                </div>
              )}
              {offerPreview === 'expired' && (
                <OfferNotice tone="neutral" icon="clock" message={<><b>Offer ended. Your +1 is kept.</b> Pick Up or Down whenever you're ready for a normal round.</>} />
              )}
              {offerPreview === 'declined' && (
                <OfferNotice tone="neutral" icon="check" message={<><b>No bonus round. Your +1 is kept.</b> Pick Up or Down whenever you're ready.</>} />
              )}
              {offerPreview === 'used' && (
                <OfferNotice tone="info" icon="ban" message={<><b>Offer no longer available.</b> You already doubled down on round #CCDDDD in another tab. Your +1 is kept.</>} />
              )}
              {offerPreview === 'replaced' && (
                <OfferNotice tone="info" icon="copy" message={<><b>Offer no longer available.</b> A new round was started in another tab. Your +1 is kept.</>} />
              )}
              {relocate && (
                <PredictionPanel
                  price={state.price}
                  title={offerPreview === 'open' || offerPreview === 'extended' ? 'Nice call. Bonus round?' : undefined}
                  disabled={offerPreview === 'submitting'}
                  isSubmitting={offerPreview === 'submitting'}
                  onPredict={() => undefined}
                />
              )}

              {/* Error notice */}
              {state.errorMessage && (
                <StatusNotice kind="error" message="Backend unavailable" detail={state.errorMessage} />
              )}
            </div>

            {/* Right column */}
            <div className="col">
              <ScoreCard
                score={state.score}
                wins={state.wins}
                losses={state.losses}
                flash={state.flash}
              />
              <RoundHistory
                status="ready"
                predictions={state.history ?? []}
                hasMore={false}
                loadingMore={false}
                pageError={false}
                onLoadMore={() => undefined}
                onRetry={() => undefined}
              />
              <HowItWorks doubleDown={state.doubleDownHelp} />
            </div>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  )
}
