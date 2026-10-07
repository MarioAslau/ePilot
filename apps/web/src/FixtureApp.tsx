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
import { HowItWorks } from './components/HowItWorks'
import { MarketCard } from './components/MarketCard'
import { ResultReceipt } from './components/ResultReceipt'
import { RoundTicket } from './components/RoundTicket'
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
              <HowItWorks />
            </div>
          </div>
        </main>
      </div>
    </QueryClientProvider>
  )
}
