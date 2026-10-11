import type { Direction, ScoreDelta } from 'contracts'

export const ROUND_MS = 60_000
export const ENTRY_MAX_TRADE_AGE_MS = 10_000
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export interface LastCheck {
  reason: 'EQUAL_PRICE' | 'PROVIDER_HOLD'
  at: string
}

export interface PredictionRecord {
  predictionId: string
  playerId: string
  direction: Direction
  mode: 'STANDARD' | 'DOUBLE_DOWN'
  status: 'PENDING' | 'RESOLVED'
  parentPredictionId?: string
  createdAt: string
  dueAt: string
  entryPrice: string
  entryTradeTime: string
  entryFetchedAt: string
  pendingKey?: 'PENDING'
  pendingDueAt?: string
  lastCheck?: LastCheck
  outcome?: 'WIN' | 'LOSS'
  scoreDelta?: ScoreDelta
  resolutionPrice?: string
  resolutionTradeTime?: string
  resolutionFetchedAt?: string
  resolvedAt?: string
}

export interface IdempotencyRecord {
  playerId: string
  idempotencyKey: string
  direction: Direction
  predictionId: string
  createdAt: string
  expiresAt: number
  kind?: 'OFFER_ACCEPT'
  offerId?: string
}

export function newPredictionId(now: Date, nextBytes: (size: number) => Buffer): string {
  const millis = String(now.getTime()).padStart(13, '0')
  return `p_${millis}_${nextBytes(4).toString('hex')}`
}

export function buildPrediction(input: {
  now: Date
  playerId: string
  direction: Direction
  idempotencyKey: string
  entryPrice: string
  entryTradeTime: string
  entryFetchedAt: string
  nextBytes: (size: number) => Buffer
  mode?: 'STANDARD' | 'DOUBLE_DOWN'
  parentPredictionId?: string
  offerId?: string
}): { prediction: PredictionRecord; idempotency: IdempotencyRecord } {
  const createdAt = input.now.toISOString()
  const dueAt = new Date(input.now.getTime() + ROUND_MS).toISOString()
  const predictionId = newPredictionId(input.now, input.nextBytes)
  return {
    prediction: {
      predictionId,
      playerId: input.playerId,
      direction: input.direction,
      mode: input.mode ?? 'STANDARD',
      status: 'PENDING',
      ...(input.parentPredictionId ? { parentPredictionId: input.parentPredictionId } : {}),
      createdAt,
      dueAt,
      entryPrice: input.entryPrice,
      entryTradeTime: input.entryTradeTime,
      entryFetchedAt: input.entryFetchedAt,
      pendingKey: 'PENDING',
      pendingDueAt: dueAt,
    },
    idempotency: {
      playerId: input.playerId,
      idempotencyKey: input.idempotencyKey,
      direction: input.direction,
      predictionId,
      createdAt,
      expiresAt: Math.floor((input.now.getTime() + IDEMPOTENCY_TTL_MS) / 1000),
      ...(input.offerId ? { kind: 'OFFER_ACCEPT' as const, offerId: input.offerId } : {}),
    },
  }
}

export function tradeIsEntryFresh(tradeTime: string, now: Date): boolean {
  return now.getTime() - new Date(tradeTime).getTime() <= ENTRY_MAX_TRADE_AGE_MS
}

export function workflowExecutionName(predictionId: string): string {
  return `prediction-${predictionId}`
}
