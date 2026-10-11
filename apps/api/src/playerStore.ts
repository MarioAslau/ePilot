import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'
import { playerKeys } from './player.js'

export interface PlayerRecord {
  playerId: string
  accessTokenHash: string
  score: number
  wins: number
  losses: number
  createdAt: string
  activePredictionId?: string
  latestResolvedPredictionId?: string
  openOfferId?: string
  latestOfferId?: string
}

export interface PlayerStore {
  putNew(record: PlayerRecord): Promise<'created' | 'exists'>
  get(playerId: string): Promise<PlayerRecord | null>
}

export function dynamoPlayerStore(tableName = process.env.TABLE_NAME): PlayerStore {
  if (!tableName) throw new Error('TABLE_NAME is not set')
  const endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient(endpoint ? { endpoint } : {}))

  return {
    async putNew(record) {
      try {
        const item = {
          ...playerKeys(record.playerId),
          playerId: record.playerId,
          accessTokenHash: record.accessTokenHash,
          score: record.score,
          wins: record.wins,
          losses: record.losses,
          createdAt: record.createdAt,
        }
        await doc.send(
          new PutCommand({
            TableName: tableName,
            Item: item,
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        )
        return 'created'
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === 'ConditionalCheckFailedException'
        ) {
          return 'exists'
        }
        throw error
      }
    },

    async get(playerId) {
      const result = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: playerKeys(playerId),
        }),
      )
      const item = result.Item
      if (!item) return null
      return {
        playerId: String(item.playerId),
        accessTokenHash: String(item.accessTokenHash),
        score: Number(item.score),
        wins: Number(item.wins),
        losses: Number(item.losses),
        createdAt: String(item.createdAt),
        ...(item.activePredictionId
          ? { activePredictionId: String(item.activePredictionId) }
          : {}),
        ...(item.latestResolvedPredictionId
          ? { latestResolvedPredictionId: String(item.latestResolvedPredictionId) }
          : {}),
        ...(item.openOfferId ? { openOfferId: String(item.openOfferId) } : {}),
        ...(item.latestOfferId ? { latestOfferId: String(item.latestOfferId) } : {}),
      }
    },
  }
}
