import { describe, expect, it } from 'vitest'
import { offerPhase, type OfferLocal } from '../offer'
import { pairFromHistory, type HistoryRound } from '../state/history'
import type { Offer } from 'contracts'

const offer: Offer = {
  offerId: 'o_p_parent',
  parentPredictionId: 'p_parent',
  mode: 'DOUBLE_DOWN',
  direction: 'UP',
  payout: { win: 2, loss: -2, parentDelta: 1 },
  issuedAt: '2026-10-11T15:00:00.000Z',
  expiresAt: '2026-10-11T15:00:10.000Z',
  extensions: 0,
  status: 'OPEN',
}

function local(overrides: Partial<OfferLocal> = {}): OfferLocal {
  return {
    seenOfferIds: new Set([offer.offerId]),
    dismissedOfferIds: new Set(),
    acceptedHereOfferId: null,
    replacedHereOfferId: null,
    mutation: null,
    ...overrides,
  }
}

function row(id: string, delta: 1 | -1 | 2 | -2 | 4, parent?: string, mode?: HistoryRound['mode']): HistoryRound {
  return {
    predictionId: id,
    direction: 'UP',
    entryPrice: '1',
    resolutionPrice: '2',
    entryTradeTime: '2026-10-11T15:00:00.000Z',
    resolutionTradeTime: '2026-10-11T15:01:00.000Z',
    outcome: delta > 0 ? 'WIN' : 'LOSS',
    scoreDelta: delta,
    parentPredictionId: parent,
    mode: mode ?? (parent ? 'DOUBLE_DOWN' : 'STANDARD'),
  }
}

describe('offerPhase', () => {
  const now = Date.parse('2026-10-11T15:00:05.000Z')

  it('shows an open offer and a submitting accept', () => {
    expect(offerPhase(offer, local({ seenOfferIds: new Set() }), now)).toBe('open')
    expect(offerPhase(offer, local({ mutation: 'accept' }), now)).toBe('submitting')
  })

  it('hides an end state this tab never saw, and a replace started here', () => {
    const expired = { ...offer, status: 'OPEN' as const }
    const later = Date.parse('2026-10-11T15:00:11.000Z')
    expect(offerPhase(expired, local({ seenOfferIds: new Set() }), later)).toBeNull()
    expect(offerPhase(expired, local(), later)).toBe('expired')
    expect(offerPhase({ ...offer, status: 'REPLACED' }, local({ replacedHereOfferId: offer.offerId }), later)).toBeNull()
    expect(offerPhase({ ...offer, status: 'REPLACED' }, local(), later)).toBe('replaced')
    expect(offerPhase({ ...offer, status: 'ACCEPTED' }, local({ acceptedHereOfferId: offer.offerId }), later)).toBeNull()
    expect(offerPhase({ ...offer, status: 'ACCEPTED' }, local(), later)).toBe('used')
    expect(offerPhase(offer, local({ dismissedOfferIds: new Set([offer.offerId]) }), now)).toBeNull()
  })
})

describe('pairFromHistory', () => {
  it('groups a bonus with the next older parent and leaves an orphan alone', () => {
    const paired = pairFromHistory([row('bonus', 2, 'parent'), row('parent', 1)])
    expect(paired).toEqual([{ kind: 'pair', bonus: row('bonus', 2, 'parent'), parent: row('parent', 1), total: 3 }])
    expect(pairFromHistory([row('bonus', -2, 'missing')])).toEqual([{ kind: 'round', round: row('bonus', -2, 'missing') }])
    const redeemed = pairFromHistory([row('child', 4, 'parent', 'REDEMPTION'), row('parent', -1)])
    expect(redeemed).toEqual([{ kind: 'pair', bonus: row('child', 4, 'parent', 'REDEMPTION'), parent: row('parent', -1), total: 3 }])
    const missed = pairFromHistory([row('child', -2, 'parent', 'REDEMPTION'), row('parent', -1)])
    expect(missed[0]).toMatchObject({ kind: 'pair', total: -3 })
  })
})
