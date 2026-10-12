import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, beforeAll, describe } from 'vitest'
import { playerKeys } from '../player.js'
import { dynamoPlayerStore } from '../playerStore.js'
import { dynamoPredictionStore } from '../predictionStore.js'
import { runGameStoreContract } from '../storeContract.js'

describe.skipIf(!process.env.DYNAMODB_ENDPOINT)('DynamoDB conditions', () => {
  let tableName = ''
  let client: DynamoDBClient

  beforeAll(async () => {
    const endpoint = process.env.DYNAMODB_ENDPOINT
    if (!endpoint) throw new Error('DYNAMODB_ENDPOINT is not set')
    process.env.AWS_ACCESS_KEY_ID ??= 'local'
    process.env.AWS_SECRET_ACCESS_KEY ??= 'local'
    process.env.AWS_REGION ??= 'eu-north-1'
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint
    tableName = `hunch-int-${Date.now()}`
    process.env.TABLE_NAME = tableName
    client = new DynamoDBClient({ endpoint })
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          { AttributeName: 'pendingKey', AttributeType: 'S' },
          { AttributeName: 'pendingDueAt', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'pending-by-due',
            KeySchema: [
              { AttributeName: 'pendingKey', KeyType: 'HASH' },
              { AttributeName: 'pendingDueAt', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'KEYS_ONLY' },
          },
        ],
      }),
    )
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const described = await client.send(new DescribeTableCommand({ TableName: tableName }))
      if (described.Table?.TableStatus === 'ACTIVE') return
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    throw new Error('table did not become active')
  })

  afterAll(async () => {
    if (!tableName || !client) return
    await client.send(new DeleteTableCommand({ TableName: tableName }))
  })

  runGameStoreContract('store contract on DynamoDB Local', () => ({
    players: dynamoPlayerStore(),
    predictions: dynamoPredictionStore(),
    async forceActivePrediction(playerId, predictionId) {
      await DynamoDBDocumentClient.from(client).send(
        new UpdateCommand({
          TableName: tableName,
          Key: playerKeys(playerId),
          UpdateExpression: 'SET activePredictionId = :id',
          ExpressionAttributeValues: { ':id': predictionId },
        }),
      )
    },
  }))
})
