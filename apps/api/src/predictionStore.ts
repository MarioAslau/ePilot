import { TransactionCanceledException } from '@aws-sdk/client-dynamodb'
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb'
import { EXTENSION_MS, MAX_EXTENSIONS, type Direction, type ScoreDelta } from 'contracts'
import { newOfferRecord, offerKey, OfferRecordSchema, type OfferGrant, type OfferRecord } from './offer.js'
import { documentClient } from './dynamo.js'
import { playerKeys } from './player.js'
import {
  IdempotencyRecordSchema,
  PredictionRecordSchema,
  type IdempotencyRecord,
  type LastCheck,
  type PredictionRecord,
} from './prediction.js'

export interface PredictionStore {
  getPrediction(playerId: string, predictionId: string): Promise<PredictionRecord | null>
  getIdempotency(playerId: string, key: string): Promise<IdempotencyRecord | null>
  create(input: {
    prediction: PredictionRecord
    idempotency: IdempotencyRecord
    openOffer?: OpenOfferChange
  }): Promise<'created' | CreateConflict>
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
  createOffer?: OfferGrant
}

/**
 * What starting a round does to the player's open offer.
 * `replace` requires the offer to still be open and marks it REPLACED.
 * `clear` only drops the player's pointer, for an offer that already changed.
 */
export type OpenOfferChange = { kind: 'replace'; offerId: string; now: string } | { kind: 'clear' }

export type CreateConflict = 'duplicate_key' | 'active_round' | 'offer_changed'

type CancellationReasons = Array<{ Code?: string } | undefined> | undefined

/** A transaction item, tagged with the result to report when its condition fails. */
interface TaggedItem<Tag extends string> {
  item: Record<string, unknown>
  onFail?: Tag
}

/**
 * The highest-priority tag among the items whose condition failed.
 * DynamoDB reports cancellation reasons in item order, so tags travel with their items.
 */
export function failedTag<Tag extends string>(
  items: ReadonlyArray<TaggedItem<Tag>>,
  reasons: CancellationReasons,
  priority: readonly Tag[],
): Tag | undefined {
  const failed = new Set(
    items.flatMap(({ onFail }, index) => (onFail && reasons?.[index]?.Code === 'ConditionalCheckFailed' ? [onFail] : [])),
  )
  return priority.find((tag) => failed.has(tag))
}

const CREATE_PRIORITY: readonly CreateConflict[] = ['duplicate_key', 'active_round', 'offer_changed']

export interface OverduePrediction {
  playerId: string
  predictionId: string
  dueAt: string
}

function predictionKey(playerId: string, predictionId: string) {
  return { pk: `PLAYER#${playerId}`, sk: `PREDICTION#${predictionId}` }
}

function idempotencyKey(playerId: string, key: string) {
  return { pk: `PLAYER#${playerId}`, sk: `IDEMPOTENCY#${key}` }
}

function cancelled(error: unknown): error is TransactionCanceledException {
  return (
    error instanceof TransactionCanceledException ||
    (error instanceof Error && error.name === 'TransactionCanceledException')
  )
}

export function dynamoPredictionStore(
  tableName = process.env.TABLE_NAME,
  doc: DynamoDBDocumentClient = documentClient(),
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
      return result.Item ? PredictionRecordSchema.parse(result.Item) : null
    },

    async getIdempotency(playerId, key) {
      const result = await doc.send(
        new GetCommand({
          TableName: tableName,
          Key: idempotencyKey(playerId, key),
          ConsistentRead: true,
        }),
      )
      return result.Item ? IdempotencyRecordSchema.parse(result.Item) : null
    },

    async create({ prediction, idempotency, openOffer }) {
      const replace = openOffer?.kind === 'replace' ? openOffer : undefined
      const items: Array<TaggedItem<CreateConflict>> = [
        {
          item: {
            Put: {
              TableName: tableName,
              Item: { ...predictionKey(prediction.playerId, prediction.predictionId), ...prediction },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        },
        {
          onFail: 'active_round',
          item: {
            Update: {
              TableName: tableName,
              Key: playerKeys(prediction.playerId),
              UpdateExpression: openOffer ? 'SET activePredictionId = :id REMOVE openOfferId' : 'SET activePredictionId = :id',
              ConditionExpression: `attribute_exists(pk) AND attribute_not_exists(activePredictionId)${replace ? ' AND openOfferId = :offer' : ''}`,
              ExpressionAttributeValues: { ':id': prediction.predictionId, ...(replace ? { ':offer': replace.offerId } : {}) },
            },
          },
        },
        {
          onFail: 'duplicate_key',
          item: {
            Put: {
              TableName: tableName,
              Item: { ...idempotencyKey(prediction.playerId, idempotency.idempotencyKey), ...idempotency },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        },
      ]
      if (replace) {
        items.push({
          onFail: 'offer_changed',
          item: {
            Update: {
              TableName: tableName,
              Key: offerKey(prediction.playerId, replace.offerId),
              UpdateExpression: 'SET #status = :replaced, replacedByPredictionId = :id',
              ConditionExpression: '#status = :open AND expiresAt > :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':replaced': 'REPLACED',
                ':id': prediction.predictionId,
                ':open': 'OPEN',
                ':now': replace.now,
              },
            },
          },
        })
      }
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items.map(({ item }) => item) }))
        return 'created'
      } catch (error) {
        const outcome = cancelled(error) ? failedTag(items, error.CancellationReasons, CREATE_PRIORITY) : undefined
        if (outcome) return outcome
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
      return result.Item ? OfferRecordSchema.parse(result.Item) : null
    },

    async acceptOffer({ prediction, idempotency, offerId, now, chosenDirection }) {
      const items: Array<TaggedItem<'duplicate_key'>> = [
        {
          item: {
            Update: {
              TableName: tableName,
              Key: offerKey(prediction.playerId, offerId),
              UpdateExpression: `SET #status = :accepted, bonusPredictionId = :id${chosenDirection ? ', chosenDirection = :chosen' : ''}`,
              ConditionExpression: '#status = :open AND expiresAt > :now',
              ExpressionAttributeNames: { '#status': 'status' },
              ExpressionAttributeValues: {
                ':accepted': 'ACCEPTED',
                ':id': prediction.predictionId,
                ':open': 'OPEN',
                ':now': now,
                ...(chosenDirection ? { ':chosen': chosenDirection } : {}),
              },
            },
          },
        },
        {
          item: {
            Update: {
              TableName: tableName,
              Key: playerKeys(prediction.playerId),
              UpdateExpression: 'SET activePredictionId = :id REMOVE openOfferId',
              ConditionExpression: 'openOfferId = :offer AND attribute_not_exists(activePredictionId)',
              ExpressionAttributeValues: { ':id': prediction.predictionId, ':offer': offerId },
            },
          },
        },
        {
          item: {
            Put: {
              TableName: tableName,
              Item: { ...predictionKey(prediction.playerId, prediction.predictionId), ...prediction },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        },
        {
          onFail: 'duplicate_key',
          item: {
            Put: {
              TableName: tableName,
              Item: { ...idempotencyKey(prediction.playerId, idempotency.idempotencyKey), ...idempotency },
              ConditionExpression: 'attribute_not_exists(pk)',
            },
          },
        },
      ]
      try {
        await doc.send(new TransactWriteCommand({ TransactItems: items.map(({ item }) => item) }))
        return 'accepted'
      } catch (error) {
        if (!cancelled(error)) throw error
        return failedTag<'duplicate_key'>(items, error.CancellationReasons, ['duplicate_key']) ?? 'conflict'
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
      const next = new Date(new Date(seenExpiresAt).getTime() + EXTENSION_MS).toISOString()
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
              ':max': MAX_EXTENSIONS,
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
              ...newOfferRecord(input.playerId, input.createOffer, input.resolvedAt),
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
          const record = PredictionRecordSchema.parse(item)
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
