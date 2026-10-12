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
import { DoubleDownOffer } from './components/DoubleDownOffer'
import { OfferEndNotice } from './components/OfferEndNotice'
import { RedemptionOffer } from './components/RedemptionOffer'
import { HowItWorks } from './components/HowItWorks'
import { PredictionPanel } from './components/PredictionPanel'
import { MarketCard } from './components/MarketCard'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
import { LedgerCard } from './components/LedgerCard'
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
  const redemption = state.followOn === 'REDEMPTION'
  const settledRedemption = redemption && state.result?.predictionId === 'p_0000000003000_eeeeffff'
  const sampleOffer = {
    offerId: 'o_p_0000000002000_ccccdddd',
    parentPredictionId: 'p_0000000002000_ccccdddd',
    mode: redemption ? 'REDEMPTION' as const : 'DOUBLE_DOWN' as const,
    direction: redemption ? null : 'UP' as const,
    payout: redemption
      ? { win: 4, loss: -2, parentDelta: -1 }
      : { win: 2, loss: -2, parentDelta: 1 },
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
                round={state.activeRound ? {
                  acceptedAt: state.activeRound.entryTime.getTime(),
                  earliestResolveAt: state.activeRound.deadline.getTime(),
                  entryPrice: state.activeRound.entryPrice,
                } : undefined}
              >
                {state.activeRound ? (
                  <>
                    {(offerPreview === 'used' || offerPreview === 'replaced') && (
                      <OfferEndNotice mode={sampleOffer.mode} phase={offerPreview} parentPredictionId={sampleOffer.parentPredictionId} name={state.redemptionName} />
                    )}
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
                      followOn={state.followOn}
                      payout={state.followOn === 'REDEMPTION' ? sampleOffer.payout : undefined}
                      parentPredictionId={state.bonus || state.followOn ? 'p_0000000002000_ccccdddd' : undefined}
                      checkedAgoSeconds={2}
                    />
                  </>
                ) : (
                  <PredictionPanel
                    price={state.price}
                    title={state.result || relocate ? 'Go again?' : undefined}
                    subtitle={state.result || relocate ? null : undefined}
                    disabled={offerPreview === 'submitting' || state.isSubmitting}
                    isSubmitting={state.isSubmitting || offerPreview === 'submitting'}
                    onPredict={() => undefined}
                  >
                    {state.result && (
                      <ResultReceipt
                        outcome={state.result.outcome}
                        direction={state.result.direction}
                        entryPrice={state.result.entryPrice}
                        resolutionPrice={state.result.resolutionPrice}
                        entryTime={state.result.entryTime}
                        resolutionTime={state.result.resolutionTime}
                        predictionId={state.result.predictionId}
                        scoreDelta={settledRedemption
                          ? (state.result.outcome === 'WIN' ? 4 : -2)
                          : state.bonus ? (state.result.outcome === 'WIN' ? 2 : -2) : undefined}
                        parent={settledRedemption
                          ? { predictionId: 'p_0000000002000_ccccdddd', scoreDelta: -1 }
                          : state.bonus ? { predictionId: 'p_0000000002000_ccccdddd', scoreDelta: 1 } : undefined}
                        followOn={settledRedemption ? 'REDEMPTION' : state.bonus ? 'DOUBLE_DOWN' : undefined}
                      />
                    )}
                    {(offerPreview === 'open' || offerPreview === 'extended' || offerPreview === 'submitting') && (
                      <div className={current.endsWith('reduced-motion') ? 'dd-force-pips' : undefined} style={current === 'rd-offer-narrow' ? { maxWidth: 375 } : undefined}>
                        {redemption ? (
                          <RedemptionOffer
                            offer={sampleOffer}
                            name={state.redemptionName}
                            restored={state.restored}
                            serverNowMs={Date.parse('2026-10-06T14:01:05.000Z')}
                            submitting={offerPreview === 'submitting'}
                            pendingDirection={offerPreview === 'submitting' ? 'DOWN' : null}
                            error={null}
                            busy={offerPreview === 'submitting'}
                            onAccept={() => undefined}
                            onDecline={() => undefined}
                            onExtend={() => undefined}
                          />
                        ) : (
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
                        )}
                      </div>
                    )}
                    {(offerPreview === 'expired' || offerPreview === 'declined' || offerPreview === 'used' || offerPreview === 'replaced') && (
                      <OfferEndNotice mode={sampleOffer.mode} phase={offerPreview} parentPredictionId={sampleOffer.parentPredictionId} name={state.redemptionName} />
                    )}
                  </PredictionPanel>
                )}
              </MarketCard>

              {/* Error notice */}
              {state.errorMessage && (
                <StatusNotice kind="error" message="Backend unavailable" detail={state.errorMessage} />
              )}
            </div>

            {/* Right column */}
            <div className="col">
              <LedgerCard
                score={state.score}
                wins={state.wins}
                losses={state.losses}
                flash={state.flash}
                status="ready"
                predictions={state.history ?? []}
                hasMore={false}
                loadingMore={false}
                pageError={false}
                onLoadMore={() => undefined}
                onRetry={() => undefined}
                pending={state.activeRound ? {
                  direction: state.activeRound.direction,
                  entryPrice: state.activeRound.entryPrice,
                  entryTradeTime: state.activeRound.entryTime.toISOString(),
                  mode: state.followOn ?? (state.bonus ? 'DOUBLE_DOWN' : 'STANDARD'),
                  phase: state.activeRound.state === 'PROVIDER_HOLD'
                    ? 'hold'
                    : state.activeRound.state === 'CHECKING_PRICE' || state.activeRound.state === 'EQUAL_PRICE'
                      ? 'comparing'
                      : 'waiting',
                  score: state.score,
                } : null}
              />
            </div>
          </div>
        </main>
        <HowItWorks doubleDown={state.doubleDownHelp} redemption={state.redemptionHelp} />
      </div>
    </QueryClientProvider>
  )
}
