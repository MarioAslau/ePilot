import type { Direction } from 'contracts'

export const ROUND_MS = 60_000
export const ENTRY_MAX_TRADE_AGE_MS = 10_000
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

export interface PredictionRecord {
  predictionId: string
  playerId: string
  direction: Direction
  mode: 'STANDARD'
  status: 'PENDING'
  createdAt: string
  dueAt: string
  entryPrice: string
  entryTradeTime: string
  entryFetchedAt: string
}

export interface IdempotencyRecord {
  playerId: string
  idempotencyKey: string
  direction: Direction
  predictionId: string
  createdAt: string
  expiresAt: number
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
}): { prediction: PredictionRecord; idempotency: IdempotencyRecord } {
  const createdAt = input.now.toISOString()
  const dueAt = new Date(input.now.getTime() + ROUND_MS).toISOString()
  const predictionId = newPredictionId(input.now, input.nextBytes)
  return {
    prediction: {
      predictionId,
      playerId: input.playerId,
      direction: input.direction,
      mode: 'STANDARD',
      status: 'PENDING',
      createdAt,
      dueAt,
      entryPrice: input.entryPrice,
      entryTradeTime: input.entryTradeTime,
      entryFetchedAt: input.entryFetchedAt,
    },
    idempotency: {
      playerId: input.playerId,
      idempotencyKey: input.idempotencyKey,
      direction: input.direction,
      predictionId,
      createdAt,
      expiresAt: Math.floor((input.now.getTime() + IDEMPOTENCY_TTL_MS) / 1000),
    },
  }
}

export function tradeIsEntryFresh(tradeTime: string, now: Date): boolean {
  return now.getTime() - new Date(tradeTime).getTime() <= ENTRY_MAX_TRADE_AGE_MS
}
