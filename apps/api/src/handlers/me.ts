import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MeResponseSchema } from 'contracts'
import { authorizationHeader, json, unauthorized } from '../http.js'
import { doubleDownEnabled, offerIsVisible, offerResponse } from '../offer.js'
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
    predictions?: Pick<PredictionStore, 'getPrediction' | 'getOffer'>
    now?: () => Date
    doubleDown?: boolean
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
  const enabled = deps.doubleDown ?? doubleDownEnabled()
  let offer = null
  if (enabled && record.latestOfferId && deps.predictions) {
    const stored = await deps.predictions.getOffer(auth.playerId, record.latestOfferId)
    if (stored && offerIsVisible(stored, clock)) offer = offerResponse(stored, clock)
  }
  let parent: { predictionId: string; scoreDelta: NonNullable<PredictionRecord['scoreDelta']> } | undefined
  if (
    latest?.status === 'RESOLVED' &&
    latest.mode === 'DOUBLE_DOWN' &&
    latest.parentPredictionId &&
    deps.predictions
  ) {
    const parentRecord = await deps.predictions.getPrediction(auth.playerId, latest.parentPredictionId)
    if (parentRecord?.scoreDelta) {
      parent = { predictionId: parentRecord.predictionId, scoreDelta: parentRecord.scoreDelta }
    }
  }

  return json(
    200,
    MeResponseSchema.parse({
      playerId: record.playerId,
      score: record.score,
      wins: record.wins,
      losses: record.losses,
      activePrediction: active ? predictionResponse(active) : null,
      latestResolvedPrediction: latest?.status === 'RESOLVED' ? predictionResponse(latest, parent) : null,
      waitReason,
      serverTime: clock.toISOString(),
      offer,
      features: { doubleDown: enabled },
    }),
  )
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMe(authorizationHeader(event.headers), event.requestContext.requestId, {
    store: dynamoPlayerStore(),
    predictions: dynamoPredictionStore(),
  })
