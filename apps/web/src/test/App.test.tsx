import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'

const token = 'ab'.repeat(32)
const playerId = 'anon_aabbccdd'

const meBody = {
  playerId,
  score: 0,
  wins: 0,
  losses: 0,
  activePrediction: null,
  latestResolvedPrediction: null,
  waitReason: null,
  serverTime: '2026-10-11T14:00:00.000Z',
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('App player restore', () => {
  it('shows a setup error when the API address is missing', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    render(<App />)
    expect(screen.getByText('API address is not configured.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('creates a player and shows score 0 when storage is empty', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    const fetchMock = vi.fn(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/players') && init?.method === 'POST') {
        return jsonResponse(200, { playerId, accessToken: token })
      }
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, meBody)
      }
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(await screen.findByLabelText(`Player ${playerId}`)).toBeInTheDocument()
    expect(screen.getAllByLabelText('Score: 0').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Your score is saved on our server. This browser remembers your anonymous player.')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(localStorage.getItem('hunch.session')).toContain(playerId)
  })

  it('restores a saved player without creating another one', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    localStorage.setItem(
      'hunch.session',
      JSON.stringify({ playerId, accessToken: token }),
    )
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/me')) return jsonResponse(200, { ...meBody, score: 4 })
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect((await screen.findAllByLabelText('Score: 4')).length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/me')
  })

  it('keeps the saved session and offers retry when restore fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    localStorage.setItem(
      'hunch.session',
      JSON.stringify({ playerId, accessToken: token }),
    )
    let posts = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: { method?: string }) => {
        if (init?.method === 'POST') posts += 1
        throw new Error('offline')
      }),
    )

    render(<App />)

    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(localStorage.getItem('hunch.session')).toContain(playerId)
    expect(posts).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(posts).toBe(0)
  })

  it('shows a storage error and does not create a player when storage throws', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByText('This browser could not save your player.')).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })
})
