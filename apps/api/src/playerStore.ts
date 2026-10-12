import { GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { z } from 'zod'
import { documentClient } from './dynamo.js'
import { playerKeys } from './player.js'

export const PlayerRecordSchema = z.object({
  playerId: z.string(),
  accessTokenHash: z.string(),
  score: z.number().int(),
  wins: z.number().int(),
  losses: z.number().int(),
  createdAt: z.string(),
  activePredictionId: z.string().optional(),
  latestResolvedPredictionId: z.string().optional(),
  openOfferId: z.string().optional(),
  latestOfferId: z.string().optional(),
})
export type PlayerRecord = z.infer<typeof PlayerRecordSchema>

export interface PlayerStore {
  putNew(record: PlayerRecord): Promise<'created' | 'exists'>
  get(playerId: string): Promise<PlayerRecord | null>
}

export function dynamoPlayerStore(
  tableName = process.env.TABLE_NAME,
  doc: DynamoDBDocumentClient = documentClient(),
): PlayerStore {
  if (!tableName) throw new Error('TABLE_NAME is not set')

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
      return result.Item ? PlayerRecordSchema.parse(result.Item) : null
    },
  }
}
