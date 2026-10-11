import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('App health shell', () => {
  it('shows a setup error when the API address is missing', () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    render(<App />)
    expect(screen.getByText('API address is not configured.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /up/i })).not.toBeInTheDocument()
  })

  it('shows connected when /health returns ok', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'ok' }),
      }),
    )
    render(<App />)
    expect(await screen.findByText('Backend connected.')).toBeInTheDocument()
    expect(screen.getByText('Play is not available yet.')).toBeInTheDocument()
  })

  it('shows unreachable when /health fails', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.test')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<App />)
    expect(await screen.findByText('Backend unreachable.')).toBeInTheDocument()
  })
})
