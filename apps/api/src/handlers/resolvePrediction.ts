import { fetchTicker, ProviderUnavailableError, type TickerQuote } from '../coinbase.js'
import type { Features } from 'contracts'
import { offerFor, readFeatures } from '../offer.js'
import { log } from '../log.js'
import type { PlayerStore } from '../playerStore.js'
import type { PredictionStore } from '../predictionStore.js'
import { decide } from '../resolution.js'
import { productionStores } from '../stores.js'

export type ResolveStatus =
  | 'SETTLED'
  | 'ALREADY_SETTLED'
  | 'TOO_EARLY'
  | 'EQUAL_PRICE'
  | 'PROVIDER_HOLD'
  | 'ORPHANED'

export interface ResolveInput {
  playerId: string
  predictionId: string
  dueAt: string
  executionName?: string
}

export async function handleResolvePrediction(
  input: ResolveInput,
  deps: {
    predictions: PredictionStore
    players: PlayerStore
    now?: () => Date
    quote?: () => Promise<TickerQuote>
    features?: Features
  },
): Promise<ResolveInput & { status: ResolveStatus }> {
  const now = deps.now ?? (() => new Date())
  const base = {
    playerId: input.playerId,
    predictionId: input.predictionId,
    dueAt: input.dueAt,
  }
  const prediction = await deps.predictions.getPrediction(input.playerId, input.predictionId)
  if (!prediction) {
    log('prediction.check', { ...base, executionName: input.executionName, reason: 'ORPHANED' })
    return { ...base, status: 'ORPHANED' as const }
  }
  if (prediction.status === 'RESOLVED') {
    await deps.predictions.clearPending(input.playerId, input.predictionId)
    log('prediction.settled', { ...base, executionName: input.executionName, reason: 'ALREADY_SETTLED' })
    return { ...base, status: 'ALREADY_SETTLED' as const }
  }

  const clock = now()
  if (clock.getTime() < new Date(prediction.dueAt).getTime()) {
    return { ...base, status: 'TOO_EARLY' as const }
  }

  const player = await deps.players.get(input.playerId)
  if (!player || player.activePredictionId !== input.predictionId) {
    await deps.predictions.clearPending(input.playerId, input.predictionId)
    log('prediction.check', { ...base, executionName: input.executionName, reason: 'ORPHANED' })
    return { ...base, status: 'ORPHANED' as const }
  }

  let quote: TickerQuote | undefined
  try {
    quote = await (deps.quote ?? (() => fetchTicker({ now })))()
  } catch (error) {
    const reason = error instanceof ProviderUnavailableError ? error.reason : 'network'
    log('prediction.check', { ...base, executionName: input.executionName, reason })
    const recorded = await deps.predictions.recordCheck(
      input.playerId,
      input.predictionId,
      'PROVIDER_HOLD',
      clock.toISOString(),
    )
    return { ...base, status: recorded === 'already_settled' ? 'ALREADY_SETTLED' as const : 'PROVIDER_HOLD' as const }
  }

  const decision = decide(prediction, clock, quote)
  if (decision.status === 'RESOLVED') {
    const createOffer = offerFor(prediction, decision.outcome, deps.features ?? readFeatures())
    const resolvedAt = clock.toISOString()
    const outcome = await deps.predictions.settle({
      playerId: input.playerId,
      predictionId: input.predictionId,
      outcome: decision.outcome,
      scoreDelta: decision.scoreDelta,
      resolutionPrice: decision.resolutionPrice,
      resolutionTradeTime: decision.resolutionTradeTime,
      resolutionFetchedAt: decision.resolutionFetchedAt,
      resolvedAt,
      ...(createOffer ? { createOffer } : {}),
    })
    const status = outcome === 'settled' ? 'SETTLED' : 'ALREADY_SETTLED'
    if (status === 'ALREADY_SETTLED') await deps.predictions.clearPending(input.playerId, input.predictionId)
    log('prediction.settled', { ...base, executionName: input.executionName, reason: status })
    if (status === 'SETTLED' && createOffer) {
      log('offer.created', {
        playerId: input.playerId,
        parentPredictionId: prediction.predictionId,
        offerId: createOffer.offerId,
        mode: createOffer.mode,
      })
    }
    return { ...base, status }
  }

  if (decision.status === 'EQUAL_PRICE' || decision.status === 'PROVIDER_HOLD') {
    const recorded = await deps.predictions.recordCheck(
      input.playerId,
      input.predictionId,
      decision.status,
      clock.toISOString(),
    )
    const status = recorded === 'already_settled' ? 'ALREADY_SETTLED' : decision.status
    log('prediction.check', { ...base, executionName: input.executionName, reason: status })
    return { ...base, status }
  }

  return { ...base, status: 'TOO_EARLY' as const }
}

export const handler = async (event: ResolveInput) =>
  handleResolvePrediction(event, productionStores())
