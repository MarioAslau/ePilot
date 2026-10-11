import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { PredictionHistoryQuerySchema, PredictionHistoryResponseSchema } from 'contracts'
import { authorizationHeader, invalidInput, json, unauthorized } from '../http.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import { predictionResponse } from './createPrediction.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'

const HISTORY_SK = /^PREDICTION#p_\d{13}_[0-9a-f]{8}$/
const DEFAULT_LIMIT = 20

function log(event: string, fields: Record<string, string | undefined>) {
  console.log(JSON.stringify({ event, ...fields }))
}

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
  deps: {
    players: PlayerStore
    predictions: PredictionStore
  },
) {
  const auth = readPlayerAuthorization(header)
  if (!auth) return unauthorized(requestId)
  const player = await deps.players.get(auth.playerId)
  if (!player || !tokenMatches(player.accessTokenHash, auth.accessToken)) {
    return unauthorized(requestId)
  }

  const parsed = PredictionHistoryQuerySchema.safeParse({
    ...(query?.limit === undefined ? {} : { limit: query.limit }),
    ...(query?.cursor === undefined ? {} : { cursor: query.cursor }),
  })
  if (!parsed.success) return invalidInput(requestId)

  let startSk: string | undefined
  if (parsed.data.cursor) {
    const decoded = decodeHistoryCursor(parsed.data.cursor)
    if (!decoded) return invalidInput(requestId)
    startSk = decoded
  }

  const limit = parsed.data.limit ?? DEFAULT_LIMIT
  const page = await deps.predictions.listResolved(auth.playerId, { limit, startSk })
  log('history.listed', {
    requestId,
    playerId: auth.playerId,
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
    {
      players: dynamoPlayerStore(),
      predictions: dynamoPredictionStore(),
    },
  )
