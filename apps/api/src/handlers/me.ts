import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MeResponseSchema } from 'contracts'
import { authorizationHeader, json, unauthorized } from '../http.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import type { PredictionRecord } from '../prediction.js'
import { predictionResponse } from './createPrediction.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'

export async function handleMe(
  header: string | undefined,
  requestId: string,
  deps: {
    store: PlayerStore
    predictions?: Pick<PredictionStore, 'getPrediction'>
    now?: () => Date
  },
) {
  const auth = readPlayerAuthorization(header)
  if (!auth) return unauthorized(requestId)

  const record = await deps.store.get(auth.playerId)
  if (!record || !tokenMatches(record.accessTokenHash, auth.accessToken)) {
    return unauthorized(requestId)
  }

  const now = deps.now ?? (() => new Date())
  const clock = now()
  let active: PredictionRecord | null = null
  if (record.activePredictionId && deps.predictions) {
    active = await deps.predictions.getPrediction(auth.playerId, record.activePredictionId)
  }
  const waitReason = !active
    ? null
    : clock.getTime() < new Date(active.dueAt).getTime()
      ? 'WAITING_FOR_DEADLINE'
      : 'CHECKING_PRICE'

  return json(
    200,
    MeResponseSchema.parse({
      playerId: record.playerId,
      score: record.score,
      wins: record.wins,
      losses: record.losses,
      activePrediction: active ? predictionResponse(active) : null,
      latestResolvedPrediction: null,
      waitReason,
      serverTime: clock.toISOString(),
    }),
  )
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMe(authorizationHeader(event.headers), event.requestContext.requestId, {
    store: dynamoPlayerStore(),
    predictions: dynamoPredictionStore(),
  })
