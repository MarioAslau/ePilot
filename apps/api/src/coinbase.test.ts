import { afterEach, describe, expect, it } from 'vitest'
import {
  clearDisplayQuoteCache,
  displayQuote,
  fetchTicker,
  ProviderUnavailableError,
} from './coinbase.js'

const now = new Date('2026-10-11T14:00:00.000Z')

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

afterEach(() => {
  clearDisplayQuoteCache()
})

describe('fetchTicker', () => {
  it('accepts a microsecond timestamp and a trailing-zero price', async () => {
    const quote = await fetchTicker({
      now: () => now,
      fetch: async () =>
        jsonResponse(200, {
          price: '65432.10',
          time: '2026-10-11T13:59:59.123456Z',
          bid: '1',
        }),
    })

    expect(quote).toEqual({
      price: '65432.10',
      tradeTime: '2026-10-11T13:59:59.123Z',
      fetchedAt: '2026-10-11T14:00:00.000Z',
    })
  })

  it.each([
    [{ time: '2026-10-11T13:59:59.000Z' }],
    [{ price: 'abc', time: '2026-10-11T13:59:59.000Z' }],
    [{ price: '0', time: '2026-10-11T13:59:59.000Z' }],
    [{ price: '1', time: 'not-a-time' }],
    ['not-json'],
  ])('rejects malformed ticker %j', async (body) => {
    await expect(
      fetchTicker({
        now: () => now,
        fetch: async () =>
          ({
            ok: true,
            status: 200,
            json: async () => {
              if (body === 'not-json') throw new Error('bad json')
              return body
            },
          }) as Response,
      }),
    ).rejects.toMatchObject({ reason: 'malformed' })
  })

  it('maps HTTP 500 to the status reason', async () => {
    await expect(
      fetchTicker({
        fetch: async () => jsonResponse(500, {}),
      }),
    ).rejects.toMatchObject({ reason: 'http_500' })
  })

  it('maps HTTP 429 to rate_limited', async () => {
    await expect(
      fetchTicker({
        fetch: async () => jsonResponse(429, {}),
      }),
    ).rejects.toMatchObject({ reason: 'rate_limited' })
  })

  it('aborts a fetch that never settles', async () => {
    await expect(
      fetchTicker({
        timeoutMs: 20,
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => {
              const error = new Error('timed out')
              error.name = 'TimeoutError'
              reject(error)
            })
          }),
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError)
  })
})

describe('displayQuote', () => {
  it('reuses a quote inside the TTL and refetches after it expires', async () => {
    let calls = 0
    let clock = now.getTime()
    const fetch = async () => {
      calls += 1
      return jsonResponse(200, {
        price: '10',
        time: '2026-10-11T14:00:00.000000Z',
      })
    }

    await displayQuote({ fetch, now: () => new Date(clock) })
    await displayQuote({ fetch, now: () => new Date(clock) })
    expect(calls).toBe(1)

    clock += 3_001
    await displayQuote({ fetch, now: () => new Date(clock) })
    expect(calls).toBe(2)
  })

  it('does not cache a failure', async () => {
    let calls = 0
    const fetch = async () => {
      calls += 1
      if (calls === 1) return jsonResponse(500, {})
      return jsonResponse(200, {
        price: '10',
        time: '2026-10-11T14:00:00.000Z',
      })
    }

    await expect(displayQuote({ fetch, now: () => now })).rejects.toMatchObject({
      reason: 'http_500',
    })
    await expect(displayQuote({ fetch, now: () => now })).resolves.toMatchObject({
      price: '10',
    })
    expect(calls).toBe(2)
  })
})
