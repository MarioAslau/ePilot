import {
  DirectionSchema,
  MINIMUM_WAIT_MS,
  ModeSchema,
  OutcomeSchema,
  PredictionSchema,
  PredictionStatusSchema,
  ScoreDeltaSchema,
  type Direction,
  type Mode,
  type Prediction,
} from 'contracts'
import { z } from 'zod'

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000

const LastCheckSchema = z.object({ reason: z.enum(['EQUAL_PRICE', 'PROVIDER_HOLD']), at: z.string() })
export type LastCheck = z.infer<typeof LastCheckSchema>

/**
 * A stored round, decoded strictly at the store boundary.
 * `mode` is absent on rounds written before Double Down, which were all standard.
 */
export const PredictionRecordSchema = z.object({
  predictionId: z.string(),
  playerId: z.string(),
  direction: DirectionSchema,
  mode: ModeSchema.default('STANDARD'),
  status: PredictionStatusSchema,
  parentPredictionId: z.string().optional(),
  createdAt: z.string(),
  dueAt: z.string(),
  entryPrice: z.string(),
  entryTradeTime: z.string(),
  entryFetchedAt: z.string(),
  pendingKey: z.literal('PENDING').optional(),
  pendingDueAt: z.string().optional(),
  lastCheck: LastCheckSchema.optional(),
  outcome: OutcomeSchema.optional(),
  scoreDelta: ScoreDeltaSchema.optional(),
  resolutionPrice: z.string().optional(),
  resolutionTradeTime: z.string().optional(),
  resolutionFetchedAt: z.string().optional(),
  resolvedAt: z.string().optional(),
})
export type PredictionRecord = z.infer<typeof PredictionRecordSchema>

export const IdempotencyRecordSchema = z.object({
  playerId: z.string(),
  idempotencyKey: z.string(),
  direction: DirectionSchema,
  predictionId: z.string(),
  createdAt: z.string(),
  expiresAt: z.number(),
  kind: z.literal('OFFER_ACCEPT').optional(),
  offerId: z.string().optional(),
})
export type IdempotencyRecord = z.infer<typeof IdempotencyRecordSchema>

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
  mode?: Mode
  parentPredictionId?: string
  offerId?: string
}): { prediction: PredictionRecord; idempotency: IdempotencyRecord } {
  const createdAt = input.now.toISOString()
  const dueAt = new Date(input.now.getTime() + MINIMUM_WAIT_MS).toISOString()
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

export function workflowExecutionName(predictionId: string): string {
  return `prediction-${predictionId}`
}

/** The wire shape of a stored prediction. `parent` is set on a resolved bonus round. */
export function predictionResponse(record: PredictionRecord, parent?: Prediction['parent']): Prediction {
  return PredictionSchema.parse({
    predictionId: record.predictionId,
    playerId: record.playerId,
    direction: record.direction,
    mode: record.mode,
    status: record.status,
    createdAt: record.createdAt,
    dueAt: record.dueAt,
    entryPrice: record.entryPrice,
    entryTradeTime: record.entryTradeTime,
    ...(record.parentPredictionId ? { parentPredictionId: record.parentPredictionId } : {}),
    ...(record.status === 'RESOLVED'
      ? {
          resolvedAt: record.resolvedAt,
          resolutionPrice: record.resolutionPrice,
          resolutionTradeTime: record.resolutionTradeTime,
          resolutionFetchedAt: record.resolutionFetchedAt,
          outcome: record.outcome,
          scoreDelta: record.scoreDelta,
          ...(parent ? { parent } : {}),
        }
      : {}),
  })
}
