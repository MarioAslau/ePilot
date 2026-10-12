import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MarketResponseSchema } from 'contracts'
import {
  displayQuote,
  DISPLAY_TRADE_AGE_MS,
  ProviderUnavailableError,
  tradeAgeWithin,
  type TickerQuote,
} from '../coinbase.js'
import { errorResponse, json } from '../http.js'
import { log } from '../log.js'

export async function handleMarket(
  requestId: string,
  deps: {
    quote?: () => Promise<TickerQuote>
    now?: () => Date
  } = {},
) {
  const now = deps.now ?? (() => new Date())
  try {
    const quote = await (deps.quote ?? (() => displayQuote({ now })))()
    const fetchedAt = now()
    return json(
      200,
      MarketResponseSchema.parse({
        price: quote.price,
        source: 'COINBASE_EXCHANGE',
        fetchedAt: quote.fetchedAt,
        tradeTime: quote.tradeTime,
        isFresh: tradeAgeWithin(quote.tradeTime, fetchedAt, DISPLAY_TRADE_AGE_MS),
      }),
    )
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    log('market.provider_error', { reason, requestId })
    return errorResponse('PROVIDER_UNAVAILABLE', requestId)
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMarket(event.requestContext.requestId)
