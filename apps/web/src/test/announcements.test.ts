import { OFFER_RULES } from 'contracts'
import { describe, expect, it } from 'vitest'
import {
  followOnResultAnnouncement,
  followOnStartedAnnouncement,
  lossOfferAnnouncement,
  OFFER_END_ANNOUNCEMENT,
  winOfferAnnouncement,
} from '../announcements'
import { offerSlot } from '../offer'
import { ledgerPhase } from '../round'

describe('announcements', () => {
  it('reads the Double Down offer from the payout table', () => {
    expect(winOfferAnnouncement(3, 'DOWN')).toBe(
      'Result: correct, plus 1 point. Your score is now 3. Double down offer: your plus 1 is kept. You can play one bonus round, same direction, down. If right, plus 2, pair total plus 3. If wrong, minus 2, pair total minus 1. The offer ends in 10 seconds; use Need more time to extend it.',
    )
  })

  it('reads the Redemption offer from its payout', () => {
    expect(lossOfferAnnouncement(-1, OFFER_RULES.REDEMPTION.payout)).toBe(
      'Result: incorrect, minus 1 point. Your score is now -1. Optional Redemption round: your minus 1 is kept. You can choose up or down for one fresh round. If right, plus 4, pair total plus 3. If wrong, minus 2, pair total minus 3. The offer ends in 10 seconds; use Need more time to extend it.',
    )
  })

  it('announces a started bonus round with its own payout', () => {
    expect(followOnStartedAnnouncement('DOUBLE_DOWN', 'UP', '65000.10')).toBe(
      'Bonus round started: up, entry price 65000.10. Plus 2 if right, minus 2 if wrong. The earliest result is in 60 seconds.',
    )
    expect(followOnStartedAnnouncement('REDEMPTION', 'DOWN', '65000.10')).toBe(
      'Redemption round started: down, entry price 65000.10. Plus 4 if right, minus 2 if wrong. The earliest result is in 60 seconds.',
    )
  })

  it('announces a settled bonus round with the pair total', () => {
    expect(followOnResultAnnouncement('DOUBLE_DOWN', 'WIN', 4, 1, 2)).toBe(
      'Bonus round correct, plus 2 points. Pair total plus 3. Your score is now 4.',
    )
    expect(followOnResultAnnouncement('DOUBLE_DOWN', 'LOSS', 0, 1, -2)).toBe(
      'Bonus round missed, minus 2 points. Pair total minus 1. Your score is now 0.',
    )
    expect(followOnResultAnnouncement('REDEMPTION', 'LOSS', -3, -1, -2)).toBe(
      'Redemption round missed, minus 2 points. Pair total minus 3. Your score is now -3.',
    )
  })

  it('says how an offer ended only where that mode has something to say', () => {
    expect(OFFER_END_ANNOUNCEMENT.DOUBLE_DOWN).toEqual({ expired: 'Double down offer ended. Your +1 is kept.', declined: null, lost: null })
    expect(OFFER_END_ANNOUNCEMENT.REDEMPTION.declined).toBe('No Redemption round. Your minus 1 stands.')
  })
})

describe('offerSlot', () => {
  it('places open offers as cards and ended ones as notices', () => {
    expect(offerSlot('open')).toBe('live')
    expect(offerSlot('submitting')).toBe('live')
    expect(offerSlot('expired')).toBe('ended')
    expect(offerSlot('declined')).toBe('ended')
    expect(offerSlot('used')).toBe('elsewhere')
    expect(offerSlot('replaced')).toBe('elsewhere')
    expect(offerSlot(null)).toBeNull()
  })
})

describe('ledgerPhase', () => {
  it('maps each wait reason to the ledger word', () => {
    expect(ledgerPhase('WAITING_FOR_DEADLINE')).toBe('waiting')
    expect(ledgerPhase('CHECKING_PRICE')).toBe('comparing')
    expect(ledgerPhase('EQUAL_PRICE')).toBe('comparing')
    expect(ledgerPhase('PROVIDER_HOLD')).toBe('hold')
  })
})
