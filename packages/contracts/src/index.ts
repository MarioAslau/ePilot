import { z } from 'zod'

/**
 * Shared API and domain contracts.
 * Prices are decimal strings. Timestamps are ISO 8601.
 * The browser must not decide settlement from a display quote.
 */

export const DirectionSchema = z.enum(['UP', 'DOWN'])
export type Direction = z.infer<typeof DirectionSchema>

export const PredictionStatusSchema = z.enum(['PENDING', 'RESOLVED'])
export type PredictionStatus = z.infer<typeof PredictionStatusSchema>

export const OutcomeSchema = z.enum(['WIN', 'LOSS'])
export type Outcome = z.infer<typeof OutcomeSchema>

/** Why a pending round has not settled. Comes from the backend, not the display price. */
export const WaitReasonSchema = z.enum([
  'WAITING_FOR_DEADLINE',
  'CHECKING_PRICE',
  'EQUAL_PRICE',
  'PROVIDER_HOLD',
])
export type WaitReason = z.infer<typeof WaitReasonSchema>

export const PriceStringSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'must be a decimal string')
export type PriceString = z.infer<typeof PriceStringSchema>

export const AccessTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)
export type AccessToken = z.infer<typeof AccessTokenSchema>

export const IdempotencyKeySchema = z.string().uuid()

export const PredictionSchema = z.object({
  predictionId: z.string().min(1),
  playerId: z.string().min(1),
  direction: DirectionSchema,
  status: PredictionStatusSchema,
  createdAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  entryPrice: PriceStringSchema,
  resolvedAt: z.string().datetime().optional(),
  resolutionPrice: PriceStringSchema.optional(),
  /** Exchange timestamp of the compared trade (Coinbase ticker `time`). */
  resolutionTradeTime: z.string().datetime().optional(),
  outcome: OutcomeSchema.optional(),
  scoreDelta: z.union([z.literal(1), z.literal(-1)]).optional(),
})
export type Prediction = z.infer<typeof PredictionSchema>

export const PlayerSchema = z.object({
  playerId: z.string().min(1),
  score: z.number().int(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  activePredictionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
})
export type Player = z.infer<typeof PlayerSchema>

export const CreatePlayerResponseSchema = z.object({
  playerId: z.string().min(1),
  /** Raw token, returned once. The server stores only its SHA-256 hash. */
  accessToken: AccessTokenSchema,
})
export type CreatePlayerResponse = z.infer<typeof CreatePlayerResponseSchema>

export const MeResponseSchema = z.object({
  playerId: z.string().min(1),
  score: z.number().int(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  activePrediction: PredictionSchema.nullable(),
  latestResolvedPrediction: PredictionSchema.nullable(),
  /** Null when there is no active prediction. */
  waitReason: WaitReasonSchema.nullable(),
  serverTime: z.string().datetime(),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

export const MarketResponseSchema = z.object({
  price: PriceStringSchema,
  fetchedAt: z.string().datetime(),
  /** Coinbase ticker `time` for this display quote. Not a settlement input. */
  tradeTime: z.string().datetime(),
  isFresh: z.boolean(),
})
export type MarketResponse = z.infer<typeof MarketResponseSchema>

export const CreatePredictionRequestSchema = z.object({
  direction: DirectionSchema,
  idempotencyKey: IdempotencyKeySchema,
})
export type CreatePredictionRequest = z.infer<typeof CreatePredictionRequestSchema>

/**
 * Lost POST /predictions response: send this same body again.
 * Same key and direction replays the original prediction.
 * Same key and a different direction is IDEMPOTENCY_CONFLICT.
 * Do not mint a new key until the server answers.
 */
export type RecoverSubmissionRequest = CreatePredictionRequest

export const CreatePredictionResponseSchema = PredictionSchema
export type CreatePredictionResponse = Prediction

export const PredictionHistoryResponseSchema = z.object({
  predictions: z.array(PredictionSchema),
  nextCursor: z.string().nullable(),
})
export type PredictionHistoryResponse = z.infer<typeof PredictionHistoryResponseSchema>

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'ACTIVE_ROUND',
  'IDEMPOTENCY_CONFLICT',
  'PROVIDER_UNAVAILABLE',
])
export type ErrorCode = z.infer<typeof ErrorCodeSchema>

/** These failures stay retryable. They are never settled as a loss. */
export const RECOVERABLE_ERROR_CODES = ['PROVIDER_UNAVAILABLE'] as const satisfies readonly ErrorCode[]

export const ErrorResponseSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  requestId: z.string().min(1),
})
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

export { evaluate } from './evaluator.js'
export type { EvaluatorInput, EvaluatorResult } from './evaluator.js'
