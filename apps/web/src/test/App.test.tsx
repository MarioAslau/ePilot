import { act, fireEvent, render, screen } from '@testing-library/react'
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

const marketBody = {
  price: '65432.10',
  source: 'COINBASE_EXCHANGE',
  fetchedAt: '2026-10-11T14:00:00.000Z',
  tradeTime: '2026-10-11T14:00:00.000Z',
  isFresh: true,
}

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function stubFetch(
  handler: (url: string, init?: { method?: string; body?: string }) => unknown,
) {
  return vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET'
    if (method === 'GET' && new URL(String(url), 'https://example.test').pathname.endsWith('/predictions')) {
      return jsonResponse(200, { predictions: [], nextCursor: null })
    }
    return handler(url, init)
  })
}

afterEach(() => {
  vi.useRealTimers()
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
    const fetchMock = stubFetch(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
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
    expect(await screen.findByRole('button', { name: /up/i })).toBeInTheDocument()
    expect(await screen.findByText('Collecting recent prices')).toBeInTheDocument()
    expect(screen.queryByText('Your settled predictions will appear here.')).not.toBeInTheDocument()
    expect(await screen.findByText(/No rounds yet/)).toBeInTheDocument()
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/players'))).toHaveLength(1)
    expect(localStorage.getItem('hunch.session')).toContain(playerId)
  })

  it('restores a saved player without creating another one', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    localStorage.setItem(
      'hunch.session',
      JSON.stringify({ playerId, accessToken: token }),
    )
    const fetchMock = stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) return jsonResponse(200, { ...meBody, score: 4 })
      throw new Error(`unexpected ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect((await screen.findAllByLabelText('Score: 4')).length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/players'))).toBe(false)
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/me'))).toBe(true)
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
    const fetchMock = stubFetch(async (_url: string) => jsonResponse(503, { code: 'PROVIDER_UNAVAILABLE' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<App />)

    expect(screen.getByText('This browser could not save your player.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/players'))).toBe(false)
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('shows a price skeleton while the market request is pending', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    render(<App />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('shows the live Coinbase price', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    vi.stubGlobal('fetch', stubFetch(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/players') && init?.method === 'POST') {
        return jsonResponse(200, { playerId, accessToken: token })
      }
      if (String(url).endsWith('/me')) return jsonResponse(200, meBody)
      throw new Error(String(url))
    }))

    render(<App />)

    expect(await screen.findByLabelText('Bitcoin price: 65,432.10 US dollars')).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
    expect(screen.getByText('Coinbase Exchange · BTC-USD')).toBeInTheDocument()
    expect(screen.getByText(/Updated 0 seconds ago · Coinbase/)).toBeInTheDocument()
    expect(screen.getByText('Collecting recent prices')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /up/i })).toBeInTheDocument()
  })

  it('keeps the last price and offers retry when a later poll fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    let marketCalls = 0
    vi.stubGlobal('fetch', stubFetch(async (url: string, init?: { method?: string }) => {
      if (String(url).endsWith('/market')) {
        marketCalls += 1
        if (marketCalls > 1) throw new Error('offline')
        return jsonResponse(200, marketBody)
      }
      if (String(url).endsWith('/players') && init?.method === 'POST') {
        return jsonResponse(200, { playerId, accessToken: token })
      }
      if (String(url).endsWith('/me')) return jsonResponse(200, meBody)
      throw new Error(String(url))
    }))

    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Live')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(screen.getByText('Delayed')).toBeInTheDocument()
    expect(screen.getByText('Price updates are delayed. Showing the last known price.')).toBeInTheDocument()
    expect(screen.getByLabelText('Bitcoin price: 65,432.10 US dollars')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
    expect(screen.getByText('Waiting for a live price')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /up/i })).toBeDisabled()
  })
})

const idempotencyKey = '11111111-1111-4111-8111-111111111111'

function pendingPrediction(entryPrice: string, dueAt: string) {
  return {
    predictionId: 'p_0000000000000_abcd1234',
    playerId,
    direction: 'UP' as const,
    mode: 'STANDARD' as const,
    status: 'PENDING' as const,
    createdAt: '2026-10-11T15:00:00.000Z',
    dueAt,
    entryPrice,
    entryTradeTime: '2026-10-11T14:59:58.000Z',
  }
}

function savedPlayer() {
  localStorage.setItem('hunch.session', JSON.stringify({ playerId, accessToken: token }))
}

describe('App predictions', () => {
  it('locks both buttons, then shows the server entry price', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(idempotencyKey)
    let posted = false
    let resolvePost: (value: ReturnType<typeof jsonResponse>) => void = () => undefined
    const bodies: string[] = []
    const recorded = pendingPrediction('70000.50', new Date(Date.now() + 60_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/predictions')) {
        bodies.push(String(init?.body))
        return new Promise<ReturnType<typeof jsonResponse>>((resolve) => {
          resolvePost = resolve
        })
      }
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, posted
          ? { ...meBody, serverTime: new Date().toISOString(), activePrediction: recorded, waitReason: 'WAITING_FOR_DEADLINE' }
          : meBody)
      }
      throw new Error(String(url))
    }))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /up/i }))
    fireEvent.click(screen.getByRole('button', { name: /down/i }))

    expect(screen.getByRole('button', { name: /up/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /down/i })).toBeDisabled()
    expect(screen.getByText('Recording entry')).toBeInTheDocument()
    expect(bodies).toHaveLength(1)

    posted = true
    resolvePost(jsonResponse(201, recorded))

    expect(await screen.findByText('70,000.50')).toBeInTheDocument()
    expect(screen.getByText('The server recorded its own entry price.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
    expect(JSON.parse(bodies[0] ?? '{}').idempotencyKey).toBe(idempotencyKey)
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Your prediction' }))
  })

  it('retries an unknown result with the same idempotency key', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(idempotencyKey)
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const keys: string[] = []
    const recorded = pendingPrediction('65432.10', new Date(Date.now() + 60_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/predictions')) {
        const parsed = JSON.parse(String(init?.body)) as { idempotencyKey: string }
        keys.push(parsed.idempotencyKey)
        if (keys.length === 1) throw new Error('timeout')
        return jsonResponse(201, recorded)
      }
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, keys.length > 1
          ? { ...meBody, serverTime: new Date().toISOString(), activePrediction: recorded, waitReason: 'WAITING_FOR_DEADLINE' }
          : meBody)
      }
      throw new Error(String(url))
    }))

    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /up/i }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getByText('Checking whether your prediction was recorded…')).toBeInTheDocument()
    expect(screen.queryByText(/not placed/i)).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(keys).toEqual([idempotencyKey, idempotencyKey])
    expect(screen.getByRole('heading', { name: 'Your prediction' })).toBeInTheDocument()
  })

  it('shows the existing round when the server reports one is active', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(idempotencyKey)
    let rejected = false
    const recorded = pendingPrediction('65432.10', new Date(Date.now() + 60_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/predictions')) {
        rejected = true
        return jsonResponse(409, { code: 'ACTIVE_ROUND', message: 'You already have an active prediction' })
      }
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, rejected
          ? { ...meBody, serverTime: new Date().toISOString(), activePrediction: recorded, waitReason: 'WAITING_FOR_DEADLINE' }
          : meBody)
      }
      throw new Error(String(url))
    }))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /up/i }))
    expect(await screen.findByRole('heading', { name: 'Your prediction' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('offers retry after a failed create and keeps the same player', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(idempotencyKey)
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const urls: string[] = []
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      urls.push(String(url))
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/predictions')) throw new Error('timeout')
      if (String(url).endsWith('/me')) return jsonResponse(200, meBody)
      throw new Error(String(url))
    }))

    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    fireEvent.click(screen.getByRole('button', { name: /up/i }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000)
    })

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByText(playerId)).toBeInTheDocument()
    expect(urls.some((url) => url.endsWith('/players'))).toBe(false)
    expect(localStorage.getItem('hunch.session')).toContain(playerId)
  })

  it('returns the buttons when the price source is unavailable', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(idempotencyKey)
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/predictions')) {
        return jsonResponse(503, { code: 'PROVIDER_UNAVAILABLE', message: 'Price source is unavailable' })
      }
      if (String(url).endsWith('/me')) return jsonResponse(200, meBody)
      throw new Error(String(url))
    }))

    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /up/i }))
    expect(await screen.findByText('Not placed. The price source is unavailable.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /up/i })).toBeEnabled()
    expect(screen.getByRole('button', { name: /down/i })).toBeEnabled()
  })

  it('shows checking price at the deadline and no result', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const recorded = pendingPrediction('65432.10', new Date(Date.now() - 1_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          serverTime: new Date().toISOString(),
          activePrediction: recorded,
          waitReason: 'CHECKING_PRICE',
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    expect(await screen.findByText('Comparing prices')).toBeInTheDocument()
    expect(screen.queryByText(/you won|you lost|score changed/i)).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Score: 0').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('shows the server receipt and lets the player go again', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const settled = {
      ...pendingPrediction('65000.101', '2026-10-11T15:01:00.000Z'),
      status: 'RESOLVED',
      outcome: 'WIN',
      scoreDelta: 1,
      resolutionPrice: '65000.104',
      resolutionTradeTime: '2026-10-11T15:02:00.000Z',
      resolutionFetchedAt: '2026-10-11T15:02:03.000Z',
      resolvedAt: '2026-10-11T15:02:03.000Z',
    }
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          score: 1,
          wins: 1,
          serverTime: new Date().toISOString(),
          activePrediction: null,
          latestResolvedPrediction: settled,
          waitReason: null,
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    expect(await screen.findByText('Correct', { selector: '#receipt-heading' })).toBeInTheDocument()
    expect(screen.getByText('Exact 65000.101 vs 65000.104')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Score: 1').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /up/i })).toBeEnabled()
  })

  it('shows an equal-price hold from the server reason', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const recorded = pendingPrediction('65432.10', new Date(Date.now() - 1_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          serverTime: new Date().toISOString(),
          activePrediction: recorded,
          waitReason: 'EQUAL_PRICE',
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    expect(await screen.findByText(/equals your entry price/)).toBeInTheDocument()
    expect(screen.queryByText('Not this time')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('shows a provider hold without calling it a loss', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const recorded = pendingPrediction('65432.10', new Date(Date.now() - 1_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          serverTime: new Date().toISOString(),
          activePrediction: recorded,
          waitReason: 'PROVIDER_HOLD',
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    expect(await screen.findByText(/temporarily unavailable/)).toBeInTheDocument()
    expect(screen.getAllByText(/never counts as a loss/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Not this time')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your prediction' }).parentElement).toHaveClass('hold')
    expect(screen.getByRole('heading', { name: 'Your prediction' }).parentElement).not.toHaveClass('down')
    expect(screen.getAllByLabelText('Score: 0').length).toBeGreaterThan(0)
  })

  it('does not focus a restored round and does not announce the countdown', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    const recorded = pendingPrediction('65432.10', new Date(Date.now() + 60_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          serverTime: new Date().toISOString(),
          activePrediction: recorded,
          waitReason: 'WAITING_FOR_DEADLINE',
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    const heading = screen.getByRole('heading', { name: 'Your prediction' })
    expect(document.activeElement).not.toBe(heading)
    const live = document.querySelector('[aria-live="polite"]')
    expect(live?.textContent).toBe('')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(live?.textContent).toBe('')
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('keeps the last score and disables new calls when a refresh fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval'] })
    let meCalls = 0
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        meCalls += 1
        if (meCalls > 1) throw new Error('offline')
        return jsonResponse(200, { ...meBody, score: 4, serverTime: new Date().toISOString() })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(screen.getAllByLabelText('Score: 4').length).toBeGreaterThan(0)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(screen.getAllByText('Last confirmed').length).toBeGreaterThan(0)
    expect(screen.getByText('Reconnecting to your player')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /up/i })).toBeDisabled()
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0)
  })

  it('shows accuracy only after a settled round, including a negative score', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET'
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (method === 'GET' && String(url).includes('/predictions')) {
        return jsonResponse(200, {
          predictions: [{
            predictionId: 'p_0000000000002_abcd1234',
            playerId,
            direction: 'DOWN',
            mode: 'STANDARD',
            status: 'RESOLVED',
            createdAt: '2026-10-11T15:00:00.000Z',
            dueAt: '2026-10-11T15:01:00.000Z',
            entryPrice: '100.00',
            entryTradeTime: '2026-10-11T15:00:00.000Z',
            resolvedAt: '2026-10-11T15:01:02.000Z',
            resolutionPrice: '99.00',
            resolutionTradeTime: '2026-10-11T15:01:02.000Z',
            outcome: 'LOSS',
            scoreDelta: -1,
          }],
          nextCursor: null,
        })
      }
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          score: -2,
          wins: 0,
          losses: 2,
          serverTime: new Date().toISOString(),
        })
      }
      throw new Error(String(url))
    }))

    const { unmount } = render(<App />)
    expect(await screen.findByText('0%')).toBeInTheDocument()
    expect(screen.getByText('all settled rounds')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Score: -2').length).toBeGreaterThan(0)
    expect(screen.getByText((_, node) => node?.textContent === 'Not this time, −1')).toBeInTheDocument()
    unmount()

    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) return jsonResponse(200, meBody)
      throw new Error(String(url))
    }))
    render(<App />)
    expect(await screen.findByText('Make your first prediction to start scoring.')).toBeInTheDocument()
    expect(screen.queryByText('Accuracy')).not.toBeInTheDocument()
  })

  it('flashes and announces a result once', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const settled = {
      ...pendingPrediction('83000.001', '2026-10-11T15:01:00.000Z'),
      status: 'RESOLVED',
      outcome: 'WIN',
      scoreDelta: 1,
      resolutionPrice: '83000.004',
      resolutionTradeTime: '2026-10-11T15:02:00.000Z',
      resolvedAt: '2026-10-11T15:02:03.000Z',
    }
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          score: 1,
          wins: 1,
          serverTime: new Date().toISOString(),
          latestResolvedPrediction: settled,
        })
      }
      throw new Error(String(url))
    }))

    const first = render(<App />)
    expect(await screen.findByText('Correct', { selector: '#receipt-heading' })).toBeInTheDocument()
    expect(screen.getByText('Exact 83000.001 vs 83000.004')).toBeInTheDocument()
    expect(document.querySelector('.flash-win')).toBeTruthy()
    expect(screen.getByText('Correct. Score 1.')).toBeInTheDocument()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    first.unmount()

    render(<App />)
    expect(await screen.findByText('Correct', { selector: '#receipt-heading' })).toBeInTheDocument()
    expect(document.querySelector('.flash-win')).toBeNull()
    expect(screen.queryByText('Correct. Score 1.')).not.toBeInTheDocument()
  })

  it('focuses the round heading after a new prediction, not after restore', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    savedPlayer()
    const recorded = pendingPrediction('65432.10', new Date(Date.now() + 60_000).toISOString())
    vi.stubGlobal('fetch', stubFetch(async (url: string) => {
      if (String(url).endsWith('/market')) return jsonResponse(200, marketBody)
      if (String(url).endsWith('/me')) {
        return jsonResponse(200, {
          ...meBody,
          serverTime: new Date().toISOString(),
          activePrediction: recorded,
          waitReason: 'WAITING_FOR_DEADLINE',
        })
      }
      throw new Error(String(url))
    }))

    render(<App />)
    const heading = await screen.findByRole('heading', { name: 'Your prediction' })
    expect(document.activeElement).not.toBe(heading)
  })
})
