import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MeResponseSchema } from 'contracts'
import { json, unauthorized } from '../http.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'

function authorizationHeader(
  headers: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined
  const found = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === 'authorization',
  )
  return found?.[1]
}

export async function handleMe(
  header: string | undefined,
  requestId: string,
  deps: { store: PlayerStore; now?: () => Date },
) {
  const auth = readPlayerAuthorization(header)
  if (!auth) return unauthorized(requestId)

  const record = await deps.store.get(auth.playerId)
  if (!record || !tokenMatches(record.accessTokenHash, auth.accessToken)) {
    return unauthorized(requestId)
  }

  const now = deps.now ?? (() => new Date())
  return json(
    200,
    MeResponseSchema.parse({
      playerId: record.playerId,
      score: record.score,
      wins: record.wins,
      losses: record.losses,
      activePrediction: null,
      latestResolvedPrediction: null,
      waitReason: null,
      serverTime: now().toISOString(),
    }),
  )
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMe(authorizationHeader(event.headers), event.requestContext.requestId, {
    store: dynamoPlayerStore(),
  })
