import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'
import { MeResponseSchema, type Prediction, type WaitReason } from 'contracts'
import { authorizationHeader, errorResponse, json } from '../http.js'
import { offerIsVisible, offerResponse } from '../offer.js'
import type { PlayerStore } from '../playerStore.js'
import { predictionResponse, type PredictionRecord } from '../prediction.js'
import type { PredictionStore } from '../predictionStore.js'
import { productionStores } from '../stores.js'
import { authenticate } from './common.js'

const CHECK_FRESH_MS = 30_000

export function waitReasonFor(active: PredictionRecord | null, now: Date): WaitReason | null {
  if (!active || active.status === 'RESOLVED') return null
  if (now.getTime() < new Date(active.dueAt).getTime()) return 'WAITING_FOR_DEADLINE'
  const check = active.lastCheck
  if (check && now.getTime() - new Date(check.at).getTime() < CHECK_FRESH_MS) return check.reason
  return 'CHECKING_PRICE'
}

export async function handleMe(
  header: string | undefined,
  requestId: string,
  deps: {
    players: PlayerStore
    predictions: Pick<PredictionStore, 'getPrediction' | 'getOffer'>
    now?: () => Date
  },
) {
  const record = await authenticate(header, deps.players)
  if (!record) return errorResponse('UNAUTHORIZED', requestId)

  const { playerId } = record
  const clock = (deps.now ?? (() => new Date()))()
  const prediction = (id: string | undefined) => (id ? deps.predictions.getPrediction(playerId, id) : null)
  const [active, latest, storedOffer] = await Promise.all([
    prediction(record.activePredictionId),
    prediction(record.latestResolvedPredictionId),
    record.latestOfferId ? deps.predictions.getOffer(playerId, record.latestOfferId) : null,
  ])
  const offer = storedOffer && offerIsVisible(storedOffer, clock) ? offerResponse(storedOffer, clock) : null
  const resolved = latest?.status === 'RESOLVED' ? latest : null
  const parentRecord = resolved && resolved.mode !== 'STANDARD' ? await prediction(resolved.parentPredictionId) : null
  const parent: Prediction['parent'] = parentRecord?.scoreDelta
    ? { predictionId: parentRecord.predictionId, scoreDelta: parentRecord.scoreDelta }
    : undefined

  return json(
    200,
    MeResponseSchema.parse({
      playerId,
      score: record.score,
      wins: record.wins,
      losses: record.losses,
      activePrediction: active ? predictionResponse(active) : null,
      latestResolvedPrediction: resolved ? predictionResponse(resolved, parent) : null,
      waitReason: waitReasonFor(active, clock),
      serverTime: clock.toISOString(),
      offer,
    }),
  )
}

export const handler: APIGatewayProxyHandlerV2 = async (event) =>
  handleMe(authorizationHeader(event.headers), event.requestContext.requestId, productionStores())
