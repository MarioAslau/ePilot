import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { PredictionHistoryQuerySchema, PredictionHistoryResponseSchema } from 'contracts'
import { authorizationHeader, errorResponse, json } from '../http.js'
import { log } from '../log.js'
import { predictionResponse } from '../prediction.js'
import { productionStores } from '../stores.js'
import { authenticate, type HandlerDeps } from './common.js'

const HISTORY_SK = /^PREDICTION#p_\d{13}_[0-9a-f]{8}$/
const DEFAULT_LIMIT = 20

export function encodeHistoryCursor(sk: string): string {
  return Buffer.from(sk, 'utf8').toString('base64url')
}

export function decodeHistoryCursor(cursor: string): string | null {
  try {
    const sk = Buffer.from(cursor, 'base64url').toString('utf8')
    return HISTORY_SK.test(sk) ? sk : null
  } catch {
    return null
  }
}

export async function handleGetPredictionHistory(
  header: string | undefined,
  query: Record<string, string | undefined> | null | undefined,
  requestId: string,
  deps: Pick<HandlerDeps, 'players' | 'predictions'>,
) {
  const player = await authenticate(header, deps.players)
  if (!player) return errorResponse('UNAUTHORIZED', requestId)
  const { playerId } = player

  const parsed = PredictionHistoryQuerySchema.safeParse({
    ...(query?.limit === undefined ? {} : { limit: query.limit }),
    ...(query?.cursor === undefined ? {} : { cursor: query.cursor }),
  })
  if (!parsed.success) return errorResponse('INVALID_INPUT', requestId)

  let startSk: string | undefined
  if (parsed.data.cursor) {
    const decoded = decodeHistoryCursor(parsed.data.cursor)
    if (!decoded) return errorResponse('INVALID_INPUT', requestId)
    startSk = decoded
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT
  const page = await deps.predictions.listResolved(playerId, { limit, startSk })
  log('history.listed', {
    requestId,
    playerId: playerId,
    count: String(page.items.length),
    hasMore: page.nextSk ? 'true' : 'false',
  })
  return json(
    200,
    PredictionHistoryResponseSchema.parse({
      predictions: page.items.map((item) => predictionResponse(item)),
      nextCursor: page.nextSk ? encodeHistoryCursor(page.nextSk) : null,
    }),
  )
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleGetPredictionHistory(
    authorizationHeader(event.headers),
    event.queryStringParameters,
    event.requestContext.requestId,
    productionStores(),
  )
