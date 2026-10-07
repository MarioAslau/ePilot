import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AppHeader } from '../components/AppHeader'

describe('AppHeader', () => {
  it('renders the Hunch wordmark', () => {
    render(<AppHeader score={0} />)
    expect(screen.getByRole('link', { name: /hunch/i })).toBeInTheDocument()
  })

  it('shows the score in the mobile chip', () => {
    render(<AppHeader score={7} />)
    expect(screen.getByLabelText(/score: 7/i)).toBeInTheDocument()
  })

  it('shows negative score', () => {
    render(<AppHeader score={-3} />)
    expect(screen.getByLabelText(/score: -3/i)).toBeInTheDocument()
  })
})
