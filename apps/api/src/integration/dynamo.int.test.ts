import {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { offerIdFor } from '../offer.js'
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

  it('pages one player’s resolved rounds and skips the pending round', async () => {
    const { predictions, created, built } = await playerAndRound(
      '77777777-7777-4777-8777-777777777777',
      9,
    )
    expect(await predictions.create(built)).toBe('created')
    expect(await predictions.settle(settlement(created.playerId, built.prediction.predictionId))).toBe('settled')
    const later = new Date(now.getTime() + 60_000)
    const second = buildPrediction({
      now: later,
      playerId: created.playerId,
      direction: 'DOWN',
      idempotencyKey: '88888888-8888-4888-8888-888888888888',
      entryPrice: '82000.00',
      entryTradeTime: later.toISOString(),
      entryFetchedAt: later.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, 10),
    })
    expect(await predictions.create(second)).toBe('created')
    expect(
      await predictions.settle({
        ...settlement(created.playerId, second.prediction.predictionId),
        outcome: 'LOSS',
        scoreDelta: -1,
      }),
    ).toBe('settled')
    const pendingAt = new Date(now.getTime() + 120_000)
    const pending = buildPrediction({
      now: pendingAt,
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: '99999999-9999-4999-8999-999999999999',
      entryPrice: '82000.00',
      entryTradeTime: pendingAt.toISOString(),
      entryFetchedAt: pendingAt.toISOString(),
      nextBytes: (size) => Buffer.alloc(size, 11),
    })
    expect(await predictions.create(pending)).toBe('created')

    const first = await predictions.listResolved(created.playerId, { limit: 1 })
    expect(first.items.map((row) => row.predictionId)).toEqual([second.prediction.predictionId])
    expect(first.nextSk).toBe(`PREDICTION#${second.prediction.predictionId}`)
    const secondPage = await predictions.listResolved(created.playerId, {
      limit: 1,
      startSk: first.nextSk ?? '',
    })
    expect(secondPage.items.map((row) => row.predictionId)).toEqual([built.prediction.predictionId])
    expect(secondPage.items.map((row) => row.predictionId)).not.toContain(pending.prediction.predictionId)
  })

  it('creates one offer with the win and lets one accept or one standard round win', async () => {
    const { players, predictions, created, built } = await playerAndRound(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      12,
    )
    expect(await predictions.create(built)).toBe('created')
    const offerId = offerIdFor(built.prediction.predictionId)
    const settled = settlement(created.playerId, built.prediction.predictionId)
    expect(await predictions.settle({
      ...settled,
      createOffer: { offerId, direction: 'UP', parentPredictionId: built.prediction.predictionId },
    })).toBe('settled')
    expect(await predictions.settle(settled)).toBe('already_settled')
    expect((await players.get(created.playerId))?.score).toBe(1)
    expect((await predictions.getOffer(created.playerId, offerId))?.status).toBe('OPEN')

    const acceptAt = '2026-10-11T15:01:08.000Z'
    const bonus = (key: string, byte: number) => buildPrediction({
      now: new Date(acceptAt),
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: key,
      entryPrice: '83000.00',
      entryTradeTime: acceptAt,
      entryFetchedAt: acceptAt,
      nextBytes: (size) => Buffer.alloc(size, byte),
      mode: 'DOUBLE_DOWN',
      parentPredictionId: built.prediction.predictionId,
      offerId,
    })
    const first = bonus('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 13)
    const second = bonus('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 14)
    const [left, right] = await Promise.all([
      predictions.acceptOffer({ ...first, offerId, now: acceptAt }),
      predictions.acceptOffer({ ...second, offerId, now: acceptAt }),
    ])
    expect([left, right].sort()).toEqual(['accepted', 'conflict'])
    expect((await predictions.getOffer(created.playerId, offerId))?.status).toBe('ACCEPTED')
  })

  it('keeps a single round when accept and create race, and one extension when the deadline is stale', async () => {
    const { predictions, created, built } = await playerAndRound(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      15,
    )
    expect(await predictions.create(built)).toBe('created')
    const offerId = offerIdFor(built.prediction.predictionId)
    expect(await predictions.settle({
      ...settlement(created.playerId, built.prediction.predictionId),
      createOffer: { offerId, direction: 'UP', parentPredictionId: built.prediction.predictionId },
    })).toBe('settled')
    const at = '2026-10-11T15:01:08.000Z'
    const seen = (await predictions.getOffer(created.playerId, offerId))?.expiresAt ?? ''
    const [extended, stale] = await Promise.all([
      predictions.extendOffer(created.playerId, offerId, seen, at),
      predictions.extendOffer(created.playerId, offerId, seen, at),
    ])
    expect([extended, stale].sort()).toEqual(['conflict', 'extended'])
    expect((await predictions.getOffer(created.playerId, offerId))?.extensions).toBe(1)

    const standard = buildPrediction({
      now: new Date(at),
      playerId: created.playerId,
      direction: 'DOWN',
      idempotencyKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      entryPrice: '83000.00',
      entryTradeTime: at,
      entryFetchedAt: at,
      nextBytes: (size) => Buffer.alloc(size, 16),
    })
    const bonus = buildPrediction({
      now: new Date(at),
      playerId: created.playerId,
      direction: 'UP',
      idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      entryPrice: '83000.00',
      entryTradeTime: at,
      entryFetchedAt: at,
      nextBytes: (size) => Buffer.alloc(size, 17),
      mode: 'DOUBLE_DOWN',
      parentPredictionId: built.prediction.predictionId,
      offerId,
    })
    const [createdRound, accepted] = await Promise.all([
      predictions.create({ ...standard, replaceOfferId: offerId, now: at }),
      predictions.acceptOffer({ ...bonus, offerId, now: at }),
    ])
    const outcomes = [createdRound, accepted].sort()
    expect(outcomes.filter((outcome) => outcome === 'created' || outcome === 'accepted')).toHaveLength(1)
    const player = await dynamoPlayerStore().get(created.playerId)
    expect(player?.activePredictionId).toBeTruthy()
  })
})
