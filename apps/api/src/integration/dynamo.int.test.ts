import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPlayer, playerKeys } from '../player.js'
import { buildPrediction } from '../prediction.js'
import { dynamoPlayerStore } from '../playerStore.js'
import { dynamoPredictionStore, type SettlementInput } from '../predictionStore.js'

const now = new Date('2026-10-11T15:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

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

  async function playerAndRound(key: string, byte: number) {
    const players = dynamoPlayerStore()
    const predictions = dynamoPredictionStore()
    const created = createPlayer(now, (size) => Buffer.alloc(size, byte))
    await players.putNew(created)
    const built = buildPrediction({
      now,
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: key,
      entryPrice: '82000.00',
      entryTradeTime: now.toISOString(),
      entryFetchedAt: now.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, byte),
    })
    return { players, predictions, created, built }
  }

  function settlement(playerId: string, predictionId: string): SettlementInput {
    return {
      playerId,
      predictionId,
      outcome: 'WIN',
      scoreDelta: 1,
      resolutionPrice: '83000.00',
      resolutionTradeTime: '2026-10-11T15:01:05.000Z',
      resolutionFetchedAt: '2026-10-11T15:01:06.000Z',
      resolvedAt: '2026-10-11T15:01:06.000Z',
    }
  }

  async function until(check: () => Promise<boolean>) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await check()) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error('timed out')
  }

  it('lets one of two different keys land', async () => {
    const { players, predictions, created, built } = await playerAndRound(
      '11111111-1111-4111-8111-111111111111',
      1,
    )
    const other = buildPrediction({
      now,
      playerId: created.playerId,
      direction: 'DOWN',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      entryPrice: '82000.00',
      entryTradeTime: now.toISOString(),
      entryFetchedAt: now.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, 2),
    })
    expect(await predictions.create(built)).toBe('created')
    expect(await predictions.create(other)).toBe('active_round')
    expect((await players.get(created.playerId))?.activePredictionId).toBe(built.prediction.predictionId)
    expect(await predictions.getPrediction(created.playerId, other.prediction.predictionId)).toBeNull()
  })

  it('returns the stored round for the same key and keeps expiresAt', async () => {
    const key = '33333333-3333-4333-8333-333333333333'
    const { predictions, created, built } = await playerAndRound(key, 3)
    const again = buildPrediction({
      now,
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: key,
      entryPrice: '82000.00',
      entryTradeTime: now.toISOString(),
      entryFetchedAt: now.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, 4),
    })
    expect(await predictions.create(built)).toBe('created')
    expect(await predictions.create(again)).toBe('duplicate_key')
    const stored = await predictions.getIdempotency(created.playerId, key)
    expect(stored?.predictionId).toBe(built.prediction.predictionId)
    expect(stored?.expiresAt).toBe(Math.floor((now.getTime() + DAY_MS) / 1000))
  })

  it('changes the score once when settle runs twice', async () => {
    const { players, predictions, created, built } = await playerAndRound(
      '44444444-4444-4444-8444-444444444444',
      5,
    )
    expect(await predictions.create(built)).toBe('created')
    const input = settlement(created.playerId, built.prediction.predictionId)
    expect(await predictions.settle(input)).toBe('settled')
    expect(await predictions.settle(input)).toBe('already_settled')
    const player = await players.get(created.playerId)
    expect(player?.score).toBe(1)
    expect(player?.wins).toBe(1)
    expect(player?.activePredictionId).toBeUndefined()
  })

  it('writes nothing when the player lock does not match', async () => {
    const { players, predictions, created, built } = await playerAndRound(
      '55555555-5555-4555-8555-555555555555',
      6,
    )
    expect(await predictions.create(built)).toBe('created')
    const doc = DynamoDBDocumentClient.from(client)
    await doc.send(
      new UpdateCommand({
        TableName: tableName,
        Key: playerKeys(created.playerId),
        UpdateExpression: 'SET activePredictionId = :id',
        ExpressionAttributeValues: { ':id': 'other' },
      }),
    )
    expect(await predictions.settle(settlement(created.playerId, built.prediction.predictionId))).toBe(
      'already_settled',
    )
    expect((await predictions.getPrediction(created.playerId, built.prediction.predictionId))?.status).toBe('PENDING')
    const player = await players.get(created.playerId)
    expect(player?.score).toBe(0)
    expect(player?.activePredictionId).toBe('other')
  })

  it('removes a settled round from the pending index', async () => {
    const { predictions, created, built } = await playerAndRound(
      '66666666-6666-4666-8666-666666666666',
      7,
    )
    expect(await predictions.create(built)).toBe('created')
    const before = new Date(now.getTime() + DAY_MS).toISOString()
    await until(async () =>
      (await predictions.listOverdue(before)).some((row) => row.predictionId === built.prediction.predictionId),
    )
    expect(await predictions.settle(settlement(created.playerId, built.prediction.predictionId))).toBe('settled')
    await until(async () =>
      (await predictions.listOverdue(before)).every((row) => row.predictionId !== built.prediction.predictionId),
    )
    expect((await predictions.getPrediction(created.playerId, built.prediction.predictionId))?.pendingKey).toBeUndefined()
  })
})
