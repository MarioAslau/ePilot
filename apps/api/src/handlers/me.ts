import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MeResponseSchema } from 'contracts'
import { authorizationHeader, json, unauthorized } from '../http.js'
import { readPlayerAuthorization, tokenMatches } from '../player.js'
import { dynamoPlayerStore, type PlayerStore } from '../playerStore.js'
import type { PredictionRecord } from '../prediction.js'
import { predictionResponse } from './createPrediction.js'
import { dynamoPredictionStore, type PredictionStore } from '../predictionStore.js'

const CHECK_FRESH_MS = 30_000

export function waitReasonFor(active: PredictionRecord | null, now: Date) {
  if (!active || active.status === 'RESOLVED') return null
  if (now.getTime() < new Date(active.dueAt).getTime()) return 'WAITING_FOR_DEADLINE'
  const check = active.lastCheck
  if (
    check &&
    (check.reason === 'EQUAL_PRICE' || check.reason === 'PROVIDER_HOLD') &&
    now.getTime() - new Date(check.at).getTime() < CHECK_FRESH_MS
  ) {
    return check.reason
  }
  return 'CHECKING_PRICE'
}

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
  let latest: PredictionRecord | null = null
  if (record.latestResolvedPredictionId && deps.predictions) {
    latest = await deps.predictions.getPrediction(auth.playerId, record.latestResolvedPredictionId)
  }
  const waitReason = waitReasonFor(active, clock)

  return json(
    200,
    MeResponseSchema.parse({
      playerId: record.playerId,
      score: record.score,
      wins: record.wins,
      losses: record.losses,
      activePrediction: active ? predictionResponse(active) : null,
      latestResolvedPrediction: latest?.status === 'RESOLVED' ? predictionResponse(latest) : null,
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
