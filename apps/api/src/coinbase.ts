import { z } from 'zod'

const TICKER_URL = 'https://api.exchange.coinbase.com/products/BTC-USD/ticker'
const DISPLAY_TTL_MS = 3_000

export const FRESH_TRADE_MS = 60_000

const TickerSchema = z.object({
  price: z.string().regex(/^\d+(\.\d+)?$/),
  time: z.string(),
})

export class ProviderUnavailableError extends Error {
  readonly reason: string

  constructor(reason: string) {
    super(reason)
    this.name = 'ProviderUnavailableError'
    this.reason = reason
  }
}

export interface TickerQuote {
  price: string
  tradeTime: string
  fetchedAt: string
}

export interface TickerDeps {
  fetch?: typeof fetch
  now?: () => Date
  timeoutMs?: number
}

function positivePrice(price: string): boolean {
  return !/^0+(\.0+)?$/.test(price)
}

function tradeTime(value: string): string {
  const trimmed = value.replace(/(\.\d{3})\d+/, '$1')
  const parsed = z.string().datetime().safeParse(trimmed)
  if (!parsed.success) throw new ProviderUnavailableError('malformed')
  return parsed.data
}

export function isFreshTrade(time: string, now: Date): boolean {
  return now.getTime() - new Date(time).getTime() <= FRESH_TRADE_MS
}

export async function fetchTicker(deps: TickerDeps = {}): Promise<TickerQuote> {
  const doFetch = deps.fetch ?? fetch
  const now = deps.now ?? (() => new Date())
  const timeoutMs = deps.timeoutMs ?? 3_000
  const fetchedAt = now().toISOString()

  try {
    const response = await doFetch(TICKER_URL, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'hunch',
      },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 429) throw new ProviderUnavailableError('rate_limited')
    if (!response.ok) throw new ProviderUnavailableError(`http_${response.status}`)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProviderUnavailableError('malformed')
    }

    const parsed = TickerSchema.safeParse(body)
    if (!parsed.success || !positivePrice(parsed.data.price)) {
      throw new ProviderUnavailableError('malformed')
    }

    return {
      price: parsed.data.price,
      tradeTime: tradeTime(parsed.data.time),
      fetchedAt,
    }
  } catch (error) {
    if (error instanceof ProviderUnavailableError) throw error
    if (
      error instanceof Error &&
      (error.name === 'TimeoutError' || error.name === 'AbortError')
    ) {
      throw new ProviderUnavailableError('timeout')
    }
    throw new ProviderUnavailableError('network')
  }
}

// ponytail: one quote per warm container. Split the cache when one process serves more than one stage.
let cached: { quote: TickerQuote; expiresAt: number } | null = null

export function clearDisplayQuoteCache(): void {
  cached = null
}

export async function displayQuote(deps: TickerDeps = {}): Promise<TickerQuote> {
  const now = (deps.now ?? (() => new Date()))()
  if (cached && cached.expiresAt > now.getTime()) return cached.quote
  const quote = await fetchTicker({ ...deps, now: () => now })
  cached = { quote, expiresAt: now.getTime() + DISPLAY_TTL_MS }
  return quote
}
