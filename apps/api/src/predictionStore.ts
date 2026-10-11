import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type { Direction, ScoreDelta } from 'contracts'
import { asOffer, offerExpiresAt, offerKey, type OfferRecord } from './offer.js'
import { playerKeys } from './player.js'
import type { IdempotencyRecord, LastCheck, PredictionRecord } from './prediction.js'

export interface PredictionStore {
  getPrediction(playerId: string, predictionId: string): Promise<PredictionRecord | null>
  getIdempotency(playerId: string, key: string): Promise<IdempotencyRecord | null>
  create(input: {
    prediction: PredictionRecord
    idempotency: IdempotencyRecord
    replaceOfferId?: string
    clearOpenOffer?: boolean
    now?: string
  }): Promise<'created' | 'active_round' | 'duplicate_key' | 'offer_changed'>
  getOffer(playerId: string, offerId: string): Promise<OfferRecord | null>
  acceptOffer(input: {
    prediction: PredictionRecord
    idempotency: IdempotencyRecord
    offerId: string
    now: string
    chosenDirection?: Direction
  }): Promise<'accepted' | 'duplicate_key' | 'conflict'>
  declineOffer(playerId: string, offerId: string): Promise<'declined' | 'conflict'>
  extendOffer(playerId: string, offerId: string, seenExpiresAt: string, now: string): Promise<'extended' | 'conflict'>
  settle(input: SettlementInput): Promise<'settled' | 'already_settled'>
  recordCheck(
    playerId: string,
    predictionId: string,
    reason: LastCheck['reason'],
    at: string,
  ): Promise<'recorded' | 'already_settled'>
  listOverdue(before: string): Promise<OverduePrediction[]>
  clearPending(playerId: string, predictionId: string): Promise<void>
  listResolved(
    playerId: string,
    input: { limit: number; startSk?: string },
  ): Promise<{ items: PredictionRecord[]; nextSk: string | null }>
}

export interface SettlementInput {
  playerId: string
  predictionId: string
  outcome: 'WIN' | 'LOSS'
  scoreDelta: ScoreDelta
  resolutionPrice: string
  resolutionTradeTime: string
  resolutionFetchedAt: string
  resolvedAt: string
  createOffer?: {
    offerId: string
    mode: 'DOUBLE_DOWN' | 'REDEMPTION'
    direction?: PredictionRecord['direction']
    parentPredictionId: string
  }
}

export interface OverduePrediction {
  playerId: string
  predictionId: string
  dueAt: string
}

export function classifyCancellation(
  reasons: Array<{ Code?: string } | undefined> | undefined,
): 'duplicate_key' | 'active_round' | 'offer_changed' | 'other' {
  if (reasons?.[2]?.Code === 'ConditionalCheckFailed') return 'duplicate_key'
  if (reasons?.[1]?.Code === 'ConditionalCheckFailed') return 'active_round'
  if (reasons?.[3]?.Code === 'ConditionalCheckFailed') return 'offer_changed'
  return 'other'
}

export function classifyAcceptCancellation(
  reasons: Array<{ Code?: string } | undefined> | undefined,
): 'duplicate_key' | 'conflict' {
  if (reasons?.[3]?.Code === 'ConditionalCheckFailed') return 'duplicate_key'
  return 'conflict'
}

function predictionKey(playerId: string, predictionId: string) {
  return { pk: `PLAYER#${playerId}`, sk: `PREDICTION#${predictionId}` }
}

function idempotencyKey(playerId: string, key: string) {
  return { pk: `PLAYER#${playerId}`, sk: `IDEMPOTENCY#${key}` }
}

function asPrediction(item: Record<string, unknown>): PredictionRecord {
  const check = item.lastCheck
  const lastCheck =
    check && typeof check === 'object' && 'reason' in check && 'at' in check
      ? {
          reason: (check as LastCheck).reason === 'PROVIDER_HOLD' ? 'PROVIDER_HOLD' as const : 'EQUAL_PRICE' as const,
          at: String((check as LastCheck).at),
        }
      : undefined
  const resolved = item.status === 'RESOLVED'
  return {
    predictionId: String(item.predictionId),
    playerId: String(item.playerId),
    direction: item.direction === 'DOWN' ? 'DOWN' : 'UP',
    mode: item.mode === 'REDEMPTION' ? 'REDEMPTION' : item.mode === 'DOUBLE_DOWN' ? 'DOUBLE_DOWN' : 'STANDARD',
    ...(typeof item.parentPredictionId === 'string' ? { parentPredictionId: item.parentPredictionId } : {}),
    status: resolved ? 'RESOLVED' : 'PENDING',
    createdAt: String(item.createdAt),
    dueAt: String(item.dueAt),
    entryPrice: String(item.entryPrice),
    entryTradeTime: String(item.entryTradeTime),
    entryFetchedAt: String(item.entryFetchedAt),
    ...(item.pendingKey === 'PENDING' && item.pendingDueAt
      ? { pendingKey: 'PENDING' as const, pendingDueAt: String(item.pendingDueAt) }
      : {}),
    ...(lastCheck ? { lastCheck } : {}),
    ...(resolved && (item.outcome === 'WIN' || item.outcome === 'LOSS')
      ? {
          outcome: item.outcome,
          scoreDelta: scoreDeltaOf(item.scoreDelta),
          resolutionPrice: String(item.resolutionPrice),
          resolutionTradeTime: String(item.resolutionTradeTime),
          resolutionFetchedAt: String(item.resolutionFetchedAt),
          resolvedAt: String(item.resolvedAt),
        }
      : {}),
  }
}

function scoreDeltaOf(value: unknown): ScoreDelta {
  if (value === -1 || value === -2 || value === 2 || value === 4) return value
  return 1
}

function cancelled(error: unknown): boolean {
  return (
    error instanceof TransactionCanceledException ||
    (error instanceof Error && error.name === 'TransactionCanceledException')
  )
}

function asIdempotency(item: Record<string, unknown>): IdempotencyRecord {
  return {
    playerId: String(item.playerId),
    idempotencyKey: String(item.idempotencyKey),
    direction: item.direction === 'DOWN' ? 'DOWN' : 'UP',
    predictionId: String(item.predictionId),
    createdAt: String(item.createdAt),
    expiresAt: Number(item.expiresAt),
    ...(item.kind === 'OFFER_ACCEPT' ? { kind: 'OFFER_ACCEPT' as const } : {}),
    ...(typeof item.offerId === 'string' ? { offerId: item.offerId } : {}),
  }
}

export function dynamoPredictionStore(
  tableName = process.env.TABLE_NAME,
  doc = DynamoDBDocumentClient.from(
    new DynamoDBClient(
      process.env.AWS_ENDPOINT_URL_DYNAMODB ? { endpoint: process.env.AWS_ENDPOINT_URL_DYNAMODB } : {},
    ),
  ),
): PredictionStore {
  if (!tableName) throw new Error('TABLE_NAME is not set')

  return {
    async getPrediction(playerId, predictionId) {
      const result = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: predictionKey(playerId, predictionId),
          ConsistentRead: true,
        }),
      )
      return result.Item ? asPrediction(result.Item) : null
    },

    async getIdempotency(playerId, key) {
      const result = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: idempotencyKey(playerId, key),
          ConsistentRead: true,
        }),
      )
      return result.Item ? asIdempotency(result.Item) : null
    },

    async create({ prediction, idempotency, replaceOfferId, clearOpenOffer, now }) {
      const playerValues: Record<string, string> = { ':id': prediction.predictionId }
      let playerUpdate = 'SET activePredictionId = :id'
      let playerCondition = 'attribute_exists(pk) AND attribute_not_exists(activePredictionId)'
      if (replaceOfferId) {
        playerUpdate = 'SET activePredictionId = :id REMOVE openOfferId'
        playerCondition += ' AND openOfferId = :offer'
        playerValues[':offer'] = replaceOfferId
      } else if (clearOpenOffer) {
        playerUpdate = 'SET activePredictionId = :id REMOVE openOfferId'
      }
      const items: Array<Record<string, unknown>> = [
        {
          Put: {
            TableName: tableName,
            Item: { ...predictionKey(prediction.playerId, prediction.predictionId), ...prediction },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: playerKeys(prediction.playerId),
            UpdateExpression: playerUpdate,
            ConditionExpression: playerCondition,
            ExpressionAttributeValues: playerValues,
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...idempotencyKey(prediction.playerId, idempotency.idempotencyKey),
              ...idempotency,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        },
      ]
      if (replaceOfferId && now) {
        items.push({
          Update: {
            TableName: tableName,
            Key: offerKey(prediction.playerId, replaceOfferId),
            UpdateExpression: 'SET #status = :replaced, replacedByPredictionId = :id',
            ConditionExpression: '#status = :open AND expiresAt > :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':replaced': 'REPLACED',
              ':id': prediction.predictionId,
              ':open': 'OPEN',
              ':now': now,
            },
          },
        })
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items }))
        return 'created'
      } catch (error) {
        if (cancelled(error)) {
          const reasons = (error as TransactionCanceledException).CancellationReasons
          const outcome = classifyCancellation(reasons)
          if (outcome !== 'other') return outcome
        }
        throw error
      }
    },

    async getOffer(playerId, offerId) {
      const result = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: offerKey(playerId, offerId),
          ConsistentRead: true,
        }),
      )
      return result.Item ? asOffer(result.Item) : null
    },

    async acceptOffer({ prediction, idempotency, offerId, now, chosenDirection }) {
      const offerValues: Record<string, string> = {
        ':accepted': 'ACCEPTED',
        ':id': prediction.predictionId,
        ':open': 'OPEN',
        ':now': now,
      }
      let offerUpdate = 'SET #status = :accepted, bonusPredictionId = :id'
      if (chosenDirection) {
        offerUpdate += ', chosenDirection = :chosen'
        offerValues[':chosen'] = chosenDirection
      }
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: offerKey(prediction.playerId, offerId),
                  UpdateExpression: offerUpdate,
                  ConditionExpression: '#status = :open AND expiresAt > :now',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: offerValues,
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: playerKeys(prediction.playerId),
                  UpdateExpression: 'SET activePredictionId = :id REMOVE openOfferId',
                  ConditionExpression: 'openOfferId = :offer AND attribute_not_exists(activePredictionId)',
                  ExpressionAttributeValues: { ':id': prediction.predictionId, ':offer': offerId },
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: { ...predictionKey(prediction.playerId, prediction.predictionId), ...prediction },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              {
                Put: {
                  TableName: tableName,
                  Item: {
                    ...idempotencyKey(prediction.playerId, idempotency.idempotencyKey),
                    ...idempotency,
                  },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
            ],
          }),
        )
        return 'accepted'
      } catch (error) {
        if (!cancelled(error)) throw error
        const reasons = (error as TransactionCanceledException).CancellationReasons
        return classifyAcceptCancellation(reasons)
      }
    },

    async declineOffer(playerId, offerId) {
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName: tableName,
                  Key: offerKey(playerId, offerId),
                  UpdateExpression: 'SET #status = :declined',
                  ConditionExpression: '#status = :open',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: { ':declined': 'DECLINED', ':open': 'OPEN' },
                },
              },
              {
                Update: {
                  TableName: tableName,
                  Key: playerKeys(playerId),
                  UpdateExpression: 'REMOVE openOfferId',
                  ConditionExpression: 'openOfferId = :offer',
                  ExpressionAttributeValues: { ':offer': offerId },
                },
              },
            ],
          }),
        )
        return 'declined'
      } catch (error) {
        if (cancelled(error)) return 'conflict'
        throw error
      }
    },

    async extendOffer(playerId, offerId, seenExpiresAt, now) {
      const next = new Date(new Date(seenExpiresAt).getTime() + 20_000).toISOString()
      try {
        await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: offerKey(playerId, offerId),
            UpdateExpression: 'SET expiresAt = :next, extensions = extensions + :one',
            ConditionExpression: '#status = :open AND expiresAt > :now AND extensions < :max AND expiresAt = :seen',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':next': next,
              ':one': 1,
              ':open': 'OPEN',
              ':now': now,
              ':max': 10,
              ':seen': seenExpiresAt,
            },
          }),
        )
        return 'extended'
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return 'conflict'
        throw error
      }
    },

    async settle(input) {
      const scoreField = input.outcome === 'WIN' ? 'wins' : 'losses'
      const playerSet = input.createOffer
        ? 'SET latestResolvedPredictionId = :id, openOfferId = :offer, latestOfferId = :offer'
        : 'SET latestResolvedPredictionId = :id'
      const items: Array<Record<string, unknown>> = [
        {
          Update: {
            TableName: tableName,
            Key: predictionKey(input.playerId, input.predictionId),
            UpdateExpression:
              'SET #status = :status, outcome = :outcome, scoreDelta = :delta, resolutionPrice = :price, resolutionTradeTime = :trade, resolutionFetchedAt = :fetched, resolvedAt = :at REMOVE pendingKey, pendingDueAt, lastCheck',
            ConditionExpression: '#status = :pending',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'RESOLVED',
              ':pending': 'PENDING',
              ':outcome': input.outcome,
              ':delta': input.scoreDelta,
              ':price': input.resolutionPrice,
              ':trade': input.resolutionTradeTime,
              ':fetched': input.resolutionFetchedAt,
              ':at': input.resolvedAt,
            },
          },
        },
        {
          Update: {
            TableName: tableName,
            Key: playerKeys(input.playerId),
            UpdateExpression: `ADD score :delta, ${scoreField} :one ${playerSet} REMOVE activePredictionId`,
            ConditionExpression: 'activePredictionId = :id',
            ExpressionAttributeValues: {
              ':delta': input.scoreDelta,
              ':one': 1,
              ':id': input.predictionId,
              ...(input.createOffer ? { ':offer': input.createOffer.offerId } : {}),
            },
          },
        },
      ]
      if (input.createOffer) {
        items.push({
          Put: {
            TableName: tableName,
            Item: {
              ...offerKey(input.playerId, input.createOffer.offerId),
              offerId: input.createOffer.offerId,
              playerId: input.playerId,
              parentPredictionId: input.createOffer.parentPredictionId,
              mode: input.createOffer.mode,
              ...(input.createOffer.direction ? { direction: input.createOffer.direction } : {}),
              issuedAt: input.resolvedAt,
              expiresAt: offerExpiresAt(input.resolvedAt),
              extensions: 0,
              status: 'OPEN',
              createdAt: input.resolvedAt,
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          },
        })
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items }))
        return 'settled'
      } catch (error) {
        if (cancelled(error)) return 'already_settled'
        throw error
      }
    },

    async recordCheck(playerId, predictionId, reason, at) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: predictionKey(playerId, predictionId),
            UpdateExpression: 'SET lastCheck = :check',
            ConditionExpression: '#status = :pending',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':check': { reason, at },
              ':pending': 'PENDING',
            },
          }),
        )
        return 'recorded'
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
          return 'already_settled'
        }
        throw error
      }
    },

    async listOverdue(before) {
      const result = await doc.send(
        new QueryCommand({
          TableName: tableName,
          IndexName: 'pending-by-due',
          KeyConditionExpression: 'pendingKey = :pending AND pendingDueAt < :before',
          ExpressionAttributeValues: { ':pending': 'PENDING', ':before': before },
        }),
      )
      return (result.Items ?? []).map((item) => ({
        playerId: String(item.pk).replace(/^PLAYER#/, ''),
        predictionId: String(item.sk).replace(/^PREDICTION#/, ''),
        dueAt: String(item.pendingDueAt),
      }))
    },

    async listResolved(playerId, { limit, startSk }) {
      const pk = `PLAYER#${playerId}`
      const items: PredictionRecord[] = []
      let exclusive = startSk
      while (items.length < limit) {
        const result = await doc.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
            FilterExpression: '#status = :resolved',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':pk': pk,
              ':prefix': 'PREDICTION#',
              ':resolved': 'RESOLVED',
            },
            ScanIndexForward: false,
            ConsistentRead: true,
            Limit: limit - items.length,
            ...(exclusive ? { ExclusiveStartKey: { pk, sk: exclusive } } : {}),
          }),
        )
        for (const item of result.Items ?? []) {
          const record = asPrediction(item)
          if (record.status === 'RESOLVED') items.push(record)
        }
        const lastKey = result.LastEvaluatedKey?.sk
        const last = items[limit - 1]
        if (items.length >= limit && last) {
          return {
            items: items.slice(0, limit),
            nextSk: lastKey ? `PREDICTION#${last.predictionId}` : null,
          }
        }
        if (!lastKey || lastKey === exclusive) return { items, nextSk: null }
        exclusive = String(lastKey)
      }
      return { items, nextSk: null }
    },

    async clearPending(playerId, predictionId) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName: tableName,
            Key: predictionKey(playerId, predictionId),
            UpdateExpression: 'REMOVE pendingKey, pendingDueAt',
            ConditionExpression: 'attribute_exists(pk)',
          }),
        )
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return
        throw error
      }
    },
  }
}
