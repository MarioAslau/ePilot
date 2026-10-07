import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { MarketCard } from './components/MarketCard'
import { ScoreCard } from './components/ScoreCard'
import { StatusNotice } from './components/StatusNotice'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5_000,
    },
  },
})

/**
 * Root application shell.
 *
 * Real data fetching and state machine wiring happens in T06 and beyond.
 * For now this renders the structural layout with placeholder props.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="wrap">
        <AppHeader score={0} />
        <main>
          <div className="layout">
            {/* Left column: market data + prediction interaction */}
            <div className="col">
              <MarketCard
                price={null}
                status="loading"
              />
              <StatusNotice kind="info" message="Connect to the backend to start playing." />
            </div>

            {/* Right column: score + history + how it works */}
            <div className="col">
              <ScoreCard score={0} wins={0} losses={0} />
              <HowItWorks />
            </div>
          </div>
        </main>

        <footer className="foot wrap">
          <p>Prices from Coinbase Exchange · Points only, no money involved.</p>
          <p>Anonymous session — your progress is saved in this browser.</p>
        </footer>
      </div>
    </QueryClientProvider>
  )
}
