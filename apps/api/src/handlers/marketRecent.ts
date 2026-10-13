import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MarketRecentQuerySchema, MarketRecentResponseSchema } from 'contracts'
import { ProviderUnavailableError, recentSamples, recentTrades, type TradeSample } from '../coinbase.js'
import { errorResponse, json } from '../http.js'
import { log } from '../log.js'

/** Recent display samples, so a chart opened mid-round has data from before the page loaded. */
export async function handleMarketRecent(
  query: Record<string, string | undefined> | undefined,
  requestId: string,
  deps: {
    trades?: () => Promise<TradeSample[]>
    now?: () => Date
  } = {},
) {
  const parsed = MarketRecentQuerySchema.safeParse(query ?? {})
  if (!parsed.success) return errorResponse('INVALID_INPUT', requestId)
  const now = deps.now ?? (() => new Date())
  try {
    const trades = await (deps.trades ?? (() => recentTrades({ now })))()
    const recent = recentSamples(trades, parsed.data.seconds, now())
    log('market.recent', {
      requestId,
      seconds: parsed.data.seconds,
      count: recent.samples.length,
      coveredSeconds: recent.coveredSeconds,
    })
    return json(200, MarketRecentResponseSchema.parse(recent))
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    log('market.provider_error', { reason, requestId, route: 'recent' })
    return errorResponse('PROVIDER_UNAVAILABLE', requestId)
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMarketRecent(event.queryStringParameters, event.requestContext.requestId)
