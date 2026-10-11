import { describe, expect, it } from 'vitest'
import { classifyCancellation, dynamoPredictionStore } from './predictionStore.js'

describe('classifyCancellation', () => {
  it('treats a failed idempotency condition as a duplicate key', () => {
    expect(
      classifyCancellation([
        { Code: 'None' },
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('duplicate_key')
  })

  it('treats a failed player condition as an active round', () => {
    expect(
      classifyCancellation([
        { Code: 'None' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'None' },
      ]),
    ).toBe('active_round')
  })

  it('keeps the duplicate-key reason when both conditions fail', () => {
    expect(
      classifyCancellation([
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ConditionalCheckFailed' },
        { Code: 'ConditionalCheckFailed' },
      ]),
    ).toBe('duplicate_key')
  })
})

describe('settlement command', () => {
  it('updates the prediction and the player in one transaction', async () => {
    const sent: Array<{ input: { TransactItems: Array<Record<string, { UpdateExpression?: string; ConditionExpression?: string }>> } }> = []
    const doc = {
      send: async (command: { input: typeof sent[number]['input'] }) => {
        sent.push(command)
      },
    }
    const store = dynamoPredictionStore('hunch-dev', doc as never)
    await store.settle({
      playerId: 'anon_07070707',
      predictionId: 'p_1',
      outcome: 'LOSS',
      scoreDelta: -1,
      resolutionPrice: '1.00',
      resolutionTradeTime: '2026-10-11T15:01:02.000Z',
      resolutionFetchedAt: '2026-10-11T15:01:03.000Z',
      resolvedAt: '2026-10-11T15:01:03.000Z',
    })
    const items = sent[0]?.input.TransactItems ?? []
    expect(items[0]?.Update?.ConditionExpression).toBe('#status = :pending')
    expect(items[0]?.Update?.UpdateExpression).toContain('REMOVE pendingKey, pendingDueAt, lastCheck')
    expect(items[1]?.Update?.ConditionExpression).toBe('activePredictionId = :id')
    expect(items[1]?.Update?.UpdateExpression).toContain('ADD score :delta, losses :one')
    expect(items[1]?.Update?.UpdateExpression).toContain('REMOVE activePredictionId')
  })

  it('treats a cancelled transaction as already settled', async () => {
    const error = new Error('cancelled')
    error.name = 'TransactionCanceledException'
    const doc = { send: async () => { throw error } }
    const store = dynamoPredictionStore('hunch-dev', doc as never)
    await expect(
      store.settle({
        playerId: 'anon_07070707',
        predictionId: 'p_1',
        outcome: 'WIN',
        scoreDelta: 1,
        resolutionPrice: '2.00',
        resolutionTradeTime: '2026-10-11T15:01:02.000Z',
        resolutionFetchedAt: '2026-10-11T15:01:03.000Z',
        resolvedAt: '2026-10-11T15:01:03.000Z',
      }),
    ).resolves.toBe('already_settled')
  })
})
