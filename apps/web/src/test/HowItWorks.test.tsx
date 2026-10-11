import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HowItWorks } from '../components/HowItWorks'

describe('HowItWorks', () => {
  it('renders the summary text', () => {
    render(<HowItWorks />)
    expect(screen.getByText('How it works')).toBeInTheDocument()
  })

  it('reveals step content when expanded', async () => {
    render(<HowItWorks />)
    const summary = screen.getByText('How it works')
    await userEvent.click(summary)
    expect(screen.getByText(/make your call/i)).toBeInTheDocument()
    expect(screen.getByText('Your rounds')).toBeInTheDocument()
    expect(screen.getByText(/at least 60 seconds/i)).toBeInTheDocument()
  })
})
