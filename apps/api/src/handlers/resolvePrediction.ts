import { ProviderUnavailableError, type TickerQuote } from '../coinbase.js'
import { log } from '../log.js'
import { offerFor } from '../offer.js'
import { decide } from '../resolution.js'
import { productionStores } from '../stores.js'
import { withDefaults, type HandlerDeps } from './common.js'

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

/**
 * One settlement attempt, called by the workflow after the deadline and again after each hold.
 * The status tells the workflow whether to stop or wait and retry.
 */
export async function handleResolvePrediction(
  input: ResolveInput,
  deps: Pick<HandlerDeps, 'players' | 'predictions' | 'now' | 'quote'>,
): Promise<ResolveInput & { status: ResolveStatus }> {
  const { players, predictions, now, quote } = withDefaults(deps)
  const { playerId, predictionId, executionName } = input
  const base = { playerId, predictionId, dueAt: input.dueAt }
  const finish = (
    status: ResolveStatus,
    event?: 'prediction.check' | 'prediction.settled',
    extra: Record<string, string> = {},
  ) => {
    if (event) log(event, { ...base, executionName, reason: status, ...extra })
    return { ...base, status }
  }

  const prediction = await predictions.getPrediction(playerId, predictionId)
  if (!prediction) return finish('ORPHANED', 'prediction.check')
  if (prediction.status === 'RESOLVED') {
    await predictions.clearPending(playerId, predictionId)
    return finish('ALREADY_SETTLED', 'prediction.settled')
  }

  const clock = now()
  if (clock.getTime() < new Date(prediction.dueAt).getTime()) return finish('TOO_EARLY')

  const player = await players.get(playerId)
  if (!player || player.activePredictionId !== predictionId) {
    await predictions.clearPending(playerId, predictionId)
    return finish('ORPHANED', 'prediction.check')
  }

  // An outage is a hold, never a loss: decide() turns a missing quote into PROVIDER_HOLD.
  let fetched: TickerQuote | undefined
  let cause: string | undefined
  try {
    fetched = await quote()
  } catch (error) {
    cause = error instanceof ProviderUnavailableError ? error.reason : 'network'
  }

  const decision = decide(prediction, clock, fetched)
  if (decision.status === 'TOO_EARLY') return finish('TOO_EARLY')
  if (decision.status === 'EQUAL_PRICE' || decision.status === 'PROVIDER_HOLD') {
    const recorded = await predictions.recordCheck(playerId, predictionId, decision.status, clock.toISOString())
    return finish(recorded === 'already_settled' ? 'ALREADY_SETTLED' : decision.status, 'prediction.check', cause ? { cause } : {})
  }

  const createOffer = offerFor(prediction, decision.outcome)
  const settled = await predictions.settle({
    playerId,
    predictionId,
    outcome: decision.outcome,
    scoreDelta: decision.scoreDelta,
    resolutionPrice: decision.resolutionPrice,
    resolutionTradeTime: decision.resolutionTradeTime,
    resolutionFetchedAt: decision.resolutionFetchedAt,
    resolvedAt: clock.toISOString(),
    ...(createOffer ? { createOffer } : {}),
  })
  if (settled === 'already_settled') {
    await predictions.clearPending(playerId, predictionId)
    return finish('ALREADY_SETTLED', 'prediction.settled')
  }
  const result = finish('SETTLED', 'prediction.settled')
  if (createOffer) {
    log('offer.created', { playerId, parentPredictionId: predictionId, offerId: createOffer.offerId, mode: createOffer.mode })
  }
  return result
}

export const handler = async (event: ResolveInput) => handleResolvePrediction(event, productionStores())
