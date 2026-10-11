import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import { playerKeys } from './player.js'
import type { IdempotencyRecord, LastCheck, PredictionRecord } from './prediction.js'

export interface PredictionStore {
  getPrediction(playerId: string, predictionId: string): Promise<PredictionRecord | null>
  getIdempotency(playerId: string, key: string): Promise<IdempotencyRecord | null>
  create(input: {
    prediction: PredictionRecord
    idempotency: IdempotencyRecord
  }): Promise<'created' | 'active_round' | 'duplicate_key'>
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
  scoreDelta: 1 | -1
  resolutionPrice: string
  resolutionTradeTime: string
  resolutionFetchedAt: string
  resolvedAt: string
}

export interface OverduePrediction {
  playerId: string
  predictionId: string
  dueAt: string
}

export function classifyCancellation(
  reasons: Array<{ Code?: string } | undefined> | undefined,
): 'duplicate_key' | 'active_round' | 'other' {
  if (reasons?.[2]?.Code === 'ConditionalCheckFailed') return 'duplicate_key'
  if (reasons?.[1]?.Code === 'ConditionalCheckFailed') return 'active_round'
  return 'other'
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
    mode: 'STANDARD',
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
          scoreDelta: item.scoreDelta === -1 ? -1 as const : 1 as const,
          resolutionPrice: String(item.resolutionPrice),
          resolutionTradeTime: String(item.resolutionTradeTime),
          resolutionFetchedAt: String(item.resolutionFetchedAt),
          resolvedAt: String(item.resolvedAt),
        }
      : {}),
  }
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

    async create({ prediction, idempotency }) {
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
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
                  UpdateExpression: 'SET activePredictionId = :id',
                  ConditionExpression:
                    'attribute_exists(pk) AND attribute_not_exists(activePredictionId)',
                  ExpressionAttributeValues: { ':id': prediction.predictionId },
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
        return 'created'
      } catch (error) {
        if (
          error instanceof TransactionCanceledException ||
          (error instanceof Error && error.name === 'TransactionCanceledException')
        ) {
          const reasons = (error as TransactionCanceledException).CancellationReasons
          const outcome = classifyCancellation(reasons)
          if (outcome !== 'other') return outcome
        }
        throw error
      }
    },

    async settle(input) {
      const scoreField = input.outcome === 'WIN' ? 'wins' : 'losses'
      try {
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
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
                  UpdateExpression: `ADD score :delta, ${scoreField} :one SET latestResolvedPredictionId = :id REMOVE activePredictionId`,
                  ConditionExpression: 'activePredictionId = :id',
                  ExpressionAttributeValues: {
                    ':delta': input.scoreDelta,
                    ':one': 1,
                    ':id': input.predictionId,
                  },
                },
              },
            ],
          }),
        )
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
