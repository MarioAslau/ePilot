import { describe, expect, it } from 'vitest'
import { dynamoPredictionStore, failedTag } from './predictionStore.js'

describe('failedTag', () => {
  const items = [
    { item: {} },
    { item: {}, onFail: 'active_round' as const },
    { item: {}, onFail: 'duplicate_key' as const },
    { item: {}, onFail: 'offer_changed' as const },
  ]
  const priority = ['duplicate_key', 'active_round', 'offer_changed'] as const
  const failed = { Code: 'ConditionalCheckFailed' }
  const ok = { Code: 'None' }

  it('reports the tag of the item whose condition failed', () => {
    expect(failedTag(items, [ok, ok, failed, ok], priority)).toBe('duplicate_key')
    expect(failedTag(items, [ok, failed, ok, ok], priority)).toBe('active_round')
    expect(failedTag(items, [ok, ok, ok, failed], priority)).toBe('offer_changed')
  })

  it('keeps the highest-priority tag when several conditions fail', () => {
    expect(failedTag(items, [failed, failed, failed, failed], priority)).toBe('duplicate_key')
  })

  it('reports nothing when only an untagged item failed', () => {
    expect(failedTag(items, [failed, ok, ok, ok], priority)).toBeUndefined()
    expect(failedTag(items, undefined, priority)).toBeUndefined()
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
