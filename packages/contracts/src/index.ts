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

/** `anon_` plus 8 hex characters. A shorter example in the docs is only an illustration. */
export const PlayerIdSchema = z.string().regex(/^anon_[0-9a-f]{8}$/)
export type PlayerId = z.infer<typeof PlayerIdSchema>

export const IdempotencyKeySchema = z.string().uuid()

export const ModeSchema = z.enum(['STANDARD', 'DOUBLE_DOWN', 'REDEMPTION'])
export type Mode = z.infer<typeof ModeSchema>

export const OfferModeSchema = z.enum(['DOUBLE_DOWN', 'REDEMPTION'])
export type OfferMode = z.infer<typeof OfferModeSchema>

export const ScoreDeltaSchema = z.union([
  z.literal(1),
  z.literal(-1),
  z.literal(2),
  z.literal(-2),
  z.literal(4),
])
export type ScoreDelta = z.infer<typeof ScoreDeltaSchema>

export const PredictionSchema = z.object({
  predictionId: z.string().min(1),
  playerId: PlayerIdSchema,
  direction: DirectionSchema,
  mode: ModeSchema,
  status: PredictionStatusSchema,
  createdAt: z.string().datetime(),
  dueAt: z.string().datetime(),
  entryPrice: PriceStringSchema,
  /** Coinbase ticker time of the entry trade. Not a client-supplied value. */
  entryTradeTime: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
  resolutionPrice: PriceStringSchema.optional(),
  /** Exchange timestamp of the compared trade (Coinbase ticker `time`). */
  resolutionTradeTime: z.string().datetime().optional(),
  /** When this server fetched the compared ticker. Not the exchange trade time. */
  resolutionFetchedAt: z.string().datetime().optional(),
  outcome: OutcomeSchema.optional(),
  scoreDelta: ScoreDeltaSchema.optional(),
  parentPredictionId: z.string().min(1).optional(),
  /** Set on a resolved bonus round in GET /me, so the receipt can show the pair. */
  parent: z
    .object({
      predictionId: z.string().min(1),
      scoreDelta: ScoreDeltaSchema,
    })
    .optional(),
})
export type Prediction = z.infer<typeof PredictionSchema>

export const OfferStatusSchema = z.enum(['OPEN', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REPLACED'])
export type OfferStatus = z.infer<typeof OfferStatusSchema>

export const OfferPayoutSchema = z.object({
  win: z.number().int(),
  loss: z.number().int(),
  parentDelta: z.number().int(),
})
export type OfferPayout = z.infer<typeof OfferPayoutSchema>

export const OfferSchema = z.object({
  offerId: z.string().min(1),
  parentPredictionId: z.string().min(1),
  mode: OfferModeSchema,
  /** Null when the player still has to choose, which is every open Redemption offer. */
  direction: DirectionSchema.nullable(),
  payout: OfferPayoutSchema,
  issuedAt: z.string().datetime(),
  /** ISO deadline. Not the numeric DynamoDB TTL attribute. */
  expiresAt: z.string().datetime(),
  extensions: z.number().int().min(0).max(10),
  status: OfferStatusSchema,
  bonusPredictionId: z.string().min(1).optional(),
  replacedByPredictionId: z.string().min(1).optional(),
  /** Set once a Redemption offer is accepted. */
  chosenDirection: DirectionSchema.optional(),
})
export type Offer = z.infer<typeof OfferSchema>

export const PlayerSchema = z.object({
  playerId: PlayerIdSchema,
  score: z.number().int(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  activePredictionId: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
})
export type Player = z.infer<typeof PlayerSchema>

export const CreatePlayerResponseSchema = z.object({
  playerId: PlayerIdSchema,
  /** Raw token, returned once. The server stores only its SHA-256 hash. */
  accessToken: AccessTokenSchema,
})
export type CreatePlayerResponse = z.infer<typeof CreatePlayerResponseSchema>

export const MeResponseSchema = z.object({
  playerId: PlayerIdSchema,
  score: z.number().int(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  activePrediction: PredictionSchema.nullable(),
  latestResolvedPrediction: PredictionSchema.nullable(),
  /** Null when there is no active prediction. */
  waitReason: WaitReasonSchema.nullable(),
  serverTime: z.string().datetime(),
  offer: OfferSchema.nullable().default(null),
  features: z
    .object({ doubleDown: z.boolean(), redemption: z.boolean() })
    .default({ doubleDown: false, redemption: false }),
})
export type MeResponse = z.infer<typeof MeResponseSchema>

export const MarketResponseSchema = z.object({
  price: PriceStringSchema,
  source: z.literal('COINBASE_EXCHANGE'),
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

export const OfferActionRequestSchema = z.object({
  idempotencyKey: IdempotencyKeySchema,
  /** Required for Redemption. Ignored for Double Down. */
  direction: DirectionSchema.optional(),
})
export type OfferActionRequest = z.infer<typeof OfferActionRequestSchema>

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

/** `limit` defaults to 20 on the server. `cursor` is an opaque continuation token. */
export const PredictionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).optional(),
})
export type PredictionHistoryQuery = z.infer<typeof PredictionHistoryQuerySchema>

export const ErrorCodeSchema = z.enum([
  'INVALID_INPUT',
  'UNAUTHORIZED',
  'ACTIVE_ROUND',
  'IDEMPOTENCY_CONFLICT',
  'PROVIDER_UNAVAILABLE',
  'OFFER_EXPIRED',
  'OFFER_ACCEPTED',
  'OFFER_DECLINED',
  'OFFER_REPLACED',
  'OFFER_NOT_FOUND',
  'MAX_EXTENSIONS',
  'DIRECTION_REQUIRED',
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
