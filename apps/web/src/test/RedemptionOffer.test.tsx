import { render, screen } from '@testing-library/react'
import type { Offer, OfferPayout } from 'contracts'
import { describe, expect, it } from 'vitest'
import { OfferPayoutTiles } from '../components/offers/OfferPayoutTiles'
import { RedemptionOffer } from '../components/RedemptionOffer'
import { REDEMPTION_NAME } from '../featureNames'
import { lossOfferAnnouncement } from '../announcements'

const offer: Offer = {
  offerId: 'o_p_parent0001',
  parentPredictionId: 'p_parent0001',
  mode: 'REDEMPTION',
  direction: null,
  payout: { win: 4, loss: -2, parentDelta: -1 },
  issuedAt: '2026-10-11T15:00:00.000Z',
  expiresAt: '2026-10-11T15:00:10.000Z',
  extensions: 0,
  status: 'OPEN',
}

const banned = [
  'double or nothing',
  'win it back',
  'redeem yourself',
  'make up for it',
  'recover',
  'streak',
  'last chance',
  'hurry',
  "don't miss",
]

function renderOffer(overrides: Partial<Parameters<typeof RedemptionOffer>[0]> = {}) {
  return render(
    <RedemptionOffer
      offer={offer}
      serverNowMs={Date.parse('2026-10-11T15:00:04.000Z')}
      submitting={false}
      pendingDirection={null}
      error={null}
      busy={false}
      onAccept={() => undefined}
      onDecline={() => undefined}
      onExtend={() => undefined}
      {...overrides}
    />,
  )
}

describe('RedemptionOffer', () => {
  it('gives the three actions the same classes, with No thanks spanning the narrow row', () => {
    renderOffer()
    const actions = screen.getAllByRole('button').filter((button) => button.classList.contains('rd-action'))
    expect(actions.map((button) => [...button.classList].filter((name) => name !== 'rd-span').join(' '))).toEqual([
      'btn rd-action',
      'btn rd-action',
      'btn rd-action',
    ])
    expect(screen.getByRole('button', { name: 'No thanks' })).toHaveClass('rd-span')
    expect(screen.queryByRole('heading', { name: 'Go again?' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: `Play one ${REDEMPTION_NAME} round?` })).toBeInTheDocument()
  })

  it('shows Recording and holds the timer on the tapped direction', () => {
    renderOffer({ submitting: true, pendingDirection: 'DOWN', busy: true })
    expect(screen.getByRole('button', { name: 'Recording…' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Play Up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'No thanks' })).toBeDisabled()
    expect(screen.getByText('Timer held')).toBeInTheDocument()
  })

  it('keeps focus on Need more time and Play Down across a re-render', () => {
    const { rerender } = renderOffer()
    screen.getByRole('button', { name: 'Need more time?' }).focus()
    rerender(
      <RedemptionOffer
        offer={offer}
        serverNowMs={Date.parse('2026-10-11T15:00:05.000Z')}
        submitting={false}
        pendingDirection={null}
        error={null}
        busy={false}
        onAccept={() => undefined}
        onDecline={() => undefined}
        onExtend={() => undefined}
      />,
    )
    expect(document.activeElement).toHaveAttribute('data-act', 'more-time')
    screen.getByRole('button', { name: 'Play Down' }).focus()
    rerender(
      <RedemptionOffer
        offer={offer}
        serverNowMs={Date.parse('2026-10-11T15:00:06.000Z')}
        submitting={false}
        pendingDirection={null}
        error={null}
        busy={false}
        onAccept={() => undefined}
        onDecline={() => undefined}
        onExtend={() => undefined}
      />,
    )
    expect(document.activeElement).toHaveAttribute('data-act', 'play-down')
  })

  it('rejects banned redemption copy', () => {
    renderOffer()
    const copy = `${document.body.textContent} ${lossOfferAnnouncement(-1, offer.payout)}`
    for (const phrase of banned) expect(copy.toLowerCase()).not.toContain(phrase)
    expect(screen.getByRole('heading', { name: `Play one ${REDEMPTION_NAME} round?` })).toBeInTheDocument()
  })
})

describe('OfferPayoutTiles', () => {
  it('adds the pair totals from the payout, not from fixed redemption numbers', () => {
    const payout: OfferPayout = { win: 3, loss: -3, parentDelta: -1 }
    render(<OfferPayoutTiles payout={payout} />)
    expect(screen.getByText('+3')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('−3')).toBeInTheDocument()
    expect(screen.getByText('−4')).toBeInTheDocument()
    expect(screen.queryByText('+4')).not.toBeInTheDocument()
  })
})
