import { useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreatePlayerResponseSchema, MeResponseSchema, type MeResponse } from 'contracts'
import { useState } from 'react'
import { AppHeader } from './components/AppHeader'
import { HowItWorks } from './components/HowItWorks'
import { StatusNotice } from './components/StatusNotice'
import {
  clearSession,
  readSession,
  StorageUnavailableError,
  writeSession,
  type Session,
} from './session'

const SCORE_COPY = 'Your score is saved on our server. This browser remembers your anonymous player.'
const STORAGE_LIMIT =
  'Clearing this browser’s storage, or opening the game on another device, starts a new player. The old score stays on the server and cannot be opened from here.'

function apiBaseUrl(): string {
  return (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
}

class HttpError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
  }
}

async function readJson(response: Response): Promise<unknown> {
  if (!response.ok) throw new HttpError(response.status)
  return response.json()
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

function PlayerStatus() {
  const baseUrl = apiBaseUrl()
  const [storageBlocked] = useState(() => {
    try {
      readSession()
      return false
    } catch (error) {
      return error instanceof StorageUnavailableError
    }
  })

  const player = useQuery({
    queryKey: ['player', baseUrl],
    enabled: baseUrl.length > 0 && !storageBlocked,
    retry: false,
    queryFn: async () => {
      const existing = readSession()
      if (existing) return fetchMe(baseUrl, existing)
      const created = await createPlayer(baseUrl)
      writeSession(created)
      return fetchMe(baseUrl, created)
    },
  })

  const me = player.data
  const rejected = player.error instanceof HttpError && player.error.status === 401

  return (
    <>
      <AppHeader score={me?.score ?? null} playerId={me?.playerId} />
      <main>
        <div className="layout">
          <div className="col">
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
 * Production shell. It creates or restores an anonymous player.
 * Direction buttons stay out until predictions exist.
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
