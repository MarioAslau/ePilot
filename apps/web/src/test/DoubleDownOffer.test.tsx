import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DoubleDownOffer } from '../components/DoubleDownOffer'
import type { Offer } from 'contracts'

const offer: Offer = {
  offerId: 'o_p_parent0001',
  parentPredictionId: 'p_parent0001',
  mode: 'DOUBLE_DOWN',
  direction: 'UP',
  payout: { win: 2, loss: -2, parentDelta: 1 },
  issuedAt: '2026-10-11T15:00:00.000Z',
  expiresAt: '2026-10-11T15:00:10.000Z',
  extensions: 0,
  status: 'OPEN',
}

function renderOffer(overrides: Partial<Offer> = {}, submitting = false) {
  return render(
    <DoubleDownOffer
      offer={{ ...offer, ...overrides }}
      serverNowMs={Date.parse('2026-10-11T15:00:04.000Z')}
      submitting={submitting}
      error={submitting ? null : null}
      busy={submitting}
      onAccept={() => undefined}
      onDecline={() => undefined}
      onExtend={() => undefined}
    />,
  )
}

describe('DoubleDownOffer', () => {
  it('uses identical action buttons and the pair arithmetic', () => {
    renderOffer()
    const actions = screen.getAllByRole('button').filter((button) => button.classList.contains('dd-action'))
    expect(actions.map((button) => button.className)).toEqual(['btn dd-action', 'btn dd-action'])
    expect(screen.getByText('+1 kept')).toBeInTheDocument()
    expect(document.getElementById('dd-desc')).toHaveTextContent('pair total plus 3')
    expect(document.querySelectorAll('.dd-pips i')).toHaveLength(10)
    expect(screen.getByRole('button', { name: 'Need more time?' })).toBeInTheDocument()
  })

  it('hides Need more time after 10 extensions and freezes while submitting', () => {
    const { rerender } = renderOffer({ extensions: 10 })
    expect(screen.queryByRole('button', { name: 'Need more time?' })).not.toBeInTheDocument()
    rerender(
      <DoubleDownOffer
        offer={offer}
        serverNowMs={Date.parse('2026-10-11T15:00:04.000Z')}
        submitting
        error="Price feed is unavailable."
        busy
        onAccept={() => undefined}
        onDecline={() => undefined}
        onExtend={() => undefined}
      />,
    )
    expect(screen.getByRole('region', { name: 'Play one bonus round in the same direction?' })).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: 'Recording…' })).toBeDisabled()
    expect(screen.getByText('Price feed is unavailable.')).toBeInTheDocument()
  })
})
