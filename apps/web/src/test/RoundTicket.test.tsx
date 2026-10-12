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
  it('shows the call, the timer, and a not-final move while waiting', () => {
    const { container } = render(<RoundTicket {...props} />)
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByRole('heading', { name: /You called Up/ })).toBeInTheDocument()
    expect(screen.getByText('Minimum wait')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('0:40')
    expect(screen.getByText('Waiting')).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Placed')).toBeInTheDocument()
    expect(screen.getByText('Comparing')).toBeInTheDocument()
    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText('Not final')).toBeInTheDocument()
    expect(screen.getByText('Ahead of entry')).toBeInTheDocument()
    expect(screen.getByText('+$12.50')).toBeInTheDocument()
    expect(screen.getByText('You can close this page. The round keeps running.')).toBeInTheDocument()
    expect(screen.queryByText(/Checked/)).not.toBeInTheDocument()
  })

  it('shows comparing copy, the age, and a spinning arc', () => {
    const { container } = render(
      <RoundTicket {...props} state="CHECKING_PRICE" secondsRemaining={0} checkedAgoSeconds={2} />,
    )
    expect(screen.getByText('Comparing prices')).toBeInTheDocument()
    expect(screen.getByText('We\'re checking the latest price.')).toBeInTheDocument()
    expect(screen.getByText('Checked 2s ago')).toBeInTheDocument()
    expect(screen.getByText('0:00')).toBeInTheDocument()
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(container.querySelector('.dial-arc')).not.toBeNull()
    expect(screen.getByText('Comparing')).toHaveAttribute('aria-current', 'step')
  })

  it('shows an equal mark or a hold mark', () => {
    const { container, rerender } = render(
      <RoundTicket {...props} state="EQUAL_PRICE" checkedAgoSeconds={2} />,
    )
    expect(screen.getByText('Price unchanged')).toBeInTheDocument()
    expect(screen.getByText('The latest price equals your entry price. Still waiting.')).toBeInTheDocument()
    expect(container.querySelector('.dial-equal')).not.toBeNull()

    rerender(<RoundTicket {...props} state="PROVIDER_HOLD" checkedAgoSeconds={2} />)
    expect(screen.getByText('On hold')).toBeInTheDocument()
    expect(container.querySelector('.dial-hold')).not.toBeNull()
    expect(container.querySelector('.ticket')).toHaveClass('hold')
  })

  it('shows a follow-on caption for Redemption and Double Down', () => {
    const { rerender } = render(
      <RoundTicket
        {...props}
        mode="REDEMPTION"
        parentPredictionId="p_0000000002000_ccccdddd"
      />,
    )
    expect(screen.getByText('Redemption')).toBeInTheDocument()
    expect(screen.getByText(/Follows round #CCDDDD/)).toBeInTheDocument()
    expect(screen.getByText('+4')).toBeInTheDocument()
    expect(screen.getByText(/pair \+3/)).toBeInTheDocument()
    expect(screen.getByText(/pair −3/)).toBeInTheDocument()

    rerender(
      <RoundTicket
        {...props}
        direction="DOWN"
        mode="DOUBLE_DOWN"
        parentPredictionId="p_0000000002000_ccccdddd"
      />,
    )
    expect(screen.getByRole('heading', { name: /You called Down/ })).toBeInTheDocument()
    expect(screen.getByText('Double Down')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText(/pair −1/)).toBeInTheDocument()
    expect(screen.getByText('Behind entry')).toBeInTheDocument()
  })
})
