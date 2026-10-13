import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HowItWorks } from '../components/HowItWorks'

describe('HowItWorks', () => {
  it('opens from the help button', async () => {
    render(<HowItWorks />)
    await userEvent.click(screen.getByRole('button', { name: 'How it works' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText(/make your call/i)).toBeInTheDocument()
    expect(screen.getByText('Your rounds')).toBeInTheDocument()
    expect(screen.getByText(/at least 60 seconds/i)).toBeInTheDocument()
    expect(screen.getByText('Double Down')).toBeInTheDocument()
    expect(screen.getByText('Redemption')).toBeInTheDocument()
  })
})
