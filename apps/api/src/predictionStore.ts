import { DynamoDBClient, TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import { playerKeys } from './player.js'
import type { IdempotencyRecord, PredictionRecord } from './prediction.js'

export interface PredictionStore {
  getPrediction(playerId: string, predictionId: string): Promise<PredictionRecord | null>
  getIdempotency(playerId: string, key: string): Promise<IdempotencyRecord | null>
  create(input: {
    prediction: PredictionRecord
    idempotency: IdempotencyRecord
  }): Promise<'created' | 'active_round' | 'duplicate_key'>
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
  return {
    predictionId: String(item.predictionId),
    playerId: String(item.playerId),
    direction: item.direction === 'DOWN' ? 'DOWN' : 'UP',
    mode: 'STANDARD',
    status: 'PENDING',
    createdAt: String(item.createdAt),
    dueAt: String(item.dueAt),
    entryPrice: String(item.entryPrice),
    entryTradeTime: String(item.entryTradeTime),
    entryFetchedAt: String(item.entryFetchedAt),
  }
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
  doc = DynamoDBDocumentClient.from(new DynamoDBClient({})),
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
  }
}
