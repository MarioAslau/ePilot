import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RoundTicket } from '../components/RoundTicket'

const props = {
  direction: 'UP' as const,
  entryPrice: '65000.00',
  entryTime: new Date('2026-10-11T15:00:00.000Z'),
  deadline: new Date('2026-10-11T15:01:00.000Z'),
  predictionId: 'p_0000000000000_abcd1234',
  latestPrice: '65012.50',
  secondsRemaining: 40,
}

describe('RoundTicket', () => {
  it('has no live region, the four steps, and a not-final delta', () => {
    const { container } = render(<RoundTicket {...props} />)
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByText('Placed')).toBeInTheDocument()
    expect(screen.getByText('Waiting')).toBeInTheDocument()
    expect(screen.getByText('Comparing')).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText(/not final/)).toBeInTheDocument()
    expect(screen.getByText(/\+12\.50/)).toBeInTheDocument()
  })
})