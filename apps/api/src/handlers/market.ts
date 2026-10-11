import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MarketResponseSchema } from 'contracts'
import {
  displayQuote,
  isFreshTrade,
  ProviderUnavailableError,
  type TickerQuote,
} from '../coinbase.js'
import { json, providerUnavailable } from '../http.js'

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
        isFresh: isFreshTrade(quote.tradeTime, fetchedAt),
      }),
    )
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    console.log(JSON.stringify({ event: 'market.provider_error', reason, requestId }))
    return providerUnavailable(requestId)
  }
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMarket(event.requestContext.requestId)
