import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { StatusNotice } from './components/StatusNotice'

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

async function fetchHealth(baseUrl: string): Promise<{ status: 'ok' }> {
  const response = await fetch(`${baseUrl}/health`)
  if (!response.ok) {
    throw new Error(`Health check failed (${response.status})`)
  }
  const body: unknown = await response.json()
  if (
    !body ||
    typeof body !== 'object' ||
    (body as { status?: unknown }).status !== 'ok'
  ) {
    throw new Error('Health check returned an unexpected body')
  }
  return { status: 'ok' }
}

function ConnectionStatus() {
  const baseUrl = apiBaseUrl()
  const health = useQuery({
    queryKey: ['health', baseUrl],
    enabled: baseUrl.length > 0,
    retry: false,
    queryFn: () => fetchHealth(baseUrl),
  })

  if (!baseUrl) {
    return (
      <StatusNotice
        kind="error"
        message="API address is not configured."
        detail="Set VITE_API_BASE_URL to the deployed API Gateway URL, then rebuild."
      />
    )
  }

  if (health.isPending) {
    return <StatusNotice kind="info" message="Checking the backend…" />
  }

  if (health.isError) {
    return (
      <StatusNotice
        kind="error"
        message="Backend unreachable."
        detail="The health check did not succeed. Play is not available."
      />
    )
  }

  return (
    <StatusNotice
      kind="info"
      message="Backend connected."
      detail="Play is not available yet."
    />
  )
}

/**
 * Hosted shell. It only reports whether GET /health succeeded.
 * The market and direction buttons stay out until the game API exists.
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
        <AppHeader score={0} />
        <main>
          <div className="layout">
            <div className="col">
              <ConnectionStatus />
            </div>
            <div className="col">
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
