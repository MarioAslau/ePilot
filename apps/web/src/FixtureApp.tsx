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
import { OFFER_RULES } from 'contracts'
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
import { ledgerPhase } from './round'

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
  const offerMode = state.offerMode ?? 'DOUBLE_DOWN'
  const roundMode = state.roundMode ?? 'STANDARD'
  const parentPredictionId = 'p_0000000002000_ccccdddd'
  const sampleOffer = {
    offerId: `o_${parentPredictionId}`,
    parentPredictionId,
    mode: offerMode,
    direction: OFFER_RULES[offerMode].directionFixed ? 'UP' as const : null,
    payout: OFFER_RULES[offerMode].payout,
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
                      <OfferEndNotice mode={offerMode} phase={offerPreview} />
                    )}
                    <RoundTicket
                      direction={state.activeRound.direction}
                      entryPrice={state.activeRound.entryPrice}
                      entryTime={state.activeRound.entryTime}
                      deadline={state.activeRound.deadline}
                      state={state.activeRound.state}
                      secondsRemaining={state.activeRound.secondsRemaining}
                      latestPrice={state.price ?? undefined}
                      mode={roundMode}
                      checkedAgoSeconds={2}
                    />
                  </>
                ) : (
                  <PredictionPanel
                    title={state.result || relocate ? 'Go again?' : undefined}
                    subtitle={state.result || relocate ? null : undefined}
                    disabled={offerPreview === 'submitting' || Boolean(state.isSubmitting)}
                    isSubmitting={Boolean(state.isSubmitting) || offerPreview === 'submitting'}
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
                        mode={roundMode}
                        parent={roundMode === 'STANDARD'
                          ? undefined
                          : { scoreDelta: OFFER_RULES[roundMode].payout.parentDelta }}
                      />
                    )}
                    {(offerPreview === 'open' || offerPreview === 'extended' || offerPreview === 'submitting') && (
                      <div className={current.endsWith('reduced-motion') ? 'dd-force-pips' : undefined} style={current === 'rd-offer-narrow' ? { maxWidth: 375 } : undefined}>
                        {offerMode === 'REDEMPTION' ? (
                          <RedemptionOffer
                            offer={sampleOffer}
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
                      <OfferEndNotice mode={offerMode} phase={offerPreview} />
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
                  mode: roundMode,
                  phase: ledgerPhase(state.activeRound.state),
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
