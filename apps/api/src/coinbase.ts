import { z } from 'zod'

const PRODUCT_URL = 'https://api.exchange.coinbase.com/products/BTC-USD'
/** Display quotes and recent trades are shared by every caller for this long. */
const DISPLAY_TTL_MS = 1_000
/** Coinbase's largest page. At ordinary volume it covers several minutes of trades. */
const TRADES_LIMIT = 1_000

/** A display quote older than this is shown as delayed. */
export const DISPLAY_TRADE_AGE_MS = 60_000
/** Entry and settlement quotes must come from a trade at most this old. */
export const SETTLEMENT_TRADE_AGE_MS = 10_000

const TradeSchema = z.object({
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

/** One trade as the chart draws it: Coinbase price and trade time. */
export interface TradeSample {
  price: string
  tradeTime: string
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

export function tradeAgeWithin(tradeTime: string, now: Date, maxAgeMs: number): boolean {
  return now.getTime() - new Date(tradeTime).getTime() <= maxAgeMs
}

/** GET a Coinbase Exchange path and validate it. Every failure becomes `ProviderUnavailableError`. */
async function getCoinbase<T>(path: string, schema: z.ZodType<T>, deps: TickerDeps): Promise<T> {
  const doFetch = deps.fetch ?? fetch
  try {
    const response = await doFetch(`${PRODUCT_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'hunch',
      },
      signal: AbortSignal.timeout(deps.timeoutMs ?? 3_000),
    })
    if (response.status === 429) throw new ProviderUnavailableError('rate_limited')
    if (!response.ok) throw new ProviderUnavailableError(`http_${response.status}`)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProviderUnavailableError('malformed')
    }
    const parsed = schema.safeParse(body)
    if (!parsed.success) throw new ProviderUnavailableError('malformed')
    return parsed.data
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

function toSample(trade: z.infer<typeof TradeSchema>): TradeSample {
  if (!positivePrice(trade.price)) throw new ProviderUnavailableError('malformed')
  return { price: trade.price, tradeTime: tradeTime(trade.time) }
}

export async function fetchTicker(deps: TickerDeps = {}): Promise<TickerQuote> {
  const fetchedAt = (deps.now ?? (() => new Date()))().toISOString()
  const sample = toSample(await getCoinbase('/ticker', TradeSchema, deps))
  return { ...sample, fetchedAt }
}

/** The latest trades, newest first, as Coinbase returns them. */
export async function fetchTrades(deps: TickerDeps = {}): Promise<TradeSample[]> {
  const trades = await getCoinbase(`/trades?limit=${TRADES_LIMIT}`, z.array(TradeSchema), deps)
  return trades.map(toSample)
}

/**
 * The last trade in each whole second of the last `seconds`, oldest first.
 * `coveredSeconds` is how far back the trades reached, which can be less than asked for in a busy market.
 */
export function recentSamples(
  trades: TradeSample[],
  seconds: number,
  now: Date,
): { samples: TradeSample[]; coveredSeconds: number } {
  const times = trades.map((trade) => Date.parse(trade.tradeTime))
  const coveredSeconds = times.length ? Math.max(0, (now.getTime() - Math.min(...times)) / 1000) : 0
  const from = now.getTime() - seconds * 1000
  const lastPerSecond = new Map<number, { at: number; sample: TradeSample }>()
  trades.forEach((trade, index) => {
    const at = times[index] ?? 0
    if (at < from || at > now.getTime()) return
    const second = Math.floor(at / 1000)
    const kept = lastPerSecond.get(second)
    if (!kept || at > kept.at) lastPerSecond.set(second, { at, sample: trade })
  })
  const samples = [...lastPerSecond.values()].sort((a, b) => a.at - b.at).map((entry) => entry.sample)
  return { samples, coveredSeconds: Math.round(coveredSeconds) }
}

// ponytail: one value per warm container. Split the cache when one process serves more than one stage.
/** Shares one successful load per `DISPLAY_TTL_MS`. Failures are not cached. */
function shortCache<T>(load: (deps: TickerDeps, now: Date) => Promise<T>) {
  let cached: { value: T; expiresAt: number } | null = null
  return {
    clear() {
      cached = null
    },
    async get(deps: TickerDeps = {}): Promise<T> {
      const now = (deps.now ?? (() => new Date()))()
      if (cached && cached.expiresAt > now.getTime()) return cached.value
      const value = await load(deps, now)
      cached = { value, expiresAt: now.getTime() + DISPLAY_TTL_MS }
      return value
    },
  }
}

const quoteCache = shortCache((deps, now) => fetchTicker({ ...deps, now: () => now }))
const tradesCache = shortCache((deps) => fetchTrades(deps))

export function clearDisplayQuoteCache(): void {
  quoteCache.clear()
  tradesCache.clear()
}

export const displayQuote = quoteCache.get
export const recentTrades = tradesCache.get
