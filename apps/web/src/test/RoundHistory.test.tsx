import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedgerCard, roundsCap } from '../components/LedgerCard'
import type { HistoryRound } from '../state/history'
import { useHistory } from '../useHistory'

const playerId = 'anon_aabbccdd'
const token = 'ab'.repeat(32)

function round(overrides: Partial<HistoryRound> = {}): HistoryRound {
  return {
    predictionId: 'p_0000000000002_abcd1234',
    direction: 'UP',
    entryPrice: '70000.50',
    resolutionPrice: '70100.00',
    entryTradeTime: '2026-10-11T14:02:31.000Z',
    resolutionTradeTime: '2026-10-11T14:03:33.000Z',
    outcome: 'WIN',
    scoreDelta: 1,
    ...overrides,
  }
}

const idle = {
  hasMore: false,
  loadingMore: false,
  pageError: false,
  onLoadMore: () => undefined,
  onRetry: () => undefined,
}

const card = {
  score: 1,
  wins: 1,
  losses: 0,
}

describe('roundsCap', () => {
  it('stops at two stage sections when a special round is the third', () => {
    const two = roundsCap({ market: 220, play: 360, offer: 0, score: 180, head: 44, pad: 48 })
    const three = roundsCap({ market: 220, play: 360 + 280, offer: 280, score: 180, head: 44, pad: 48 })
    expect(three).toBe(two)
    expect(two).toBeGreaterThan(152)
  })

  it('keeps at least two rows when the stage is short', () => {
    expect(roundsCap({ market: 80, play: 80, offer: 0, score: 200, head: 44, pad: 48 })).toBe(152)
  })
})

describe('LedgerCard', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('collapses the rounds list from the heading', async () => {
    const { container } = render(<LedgerCard {...card} status="ready" predictions={[round()]} {...idle} />)
    expect(screen.getByText(/\$70,000\.50/)).toBeInTheDocument()
    expect(container.querySelector('.hm > span .price-arrow')).not.toBeNull()
    expect(container.querySelector('.hd-ic')).not.toBeNull()
    expect(container.querySelector('.hd')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Your rounds' }))
    expect(screen.queryByText(/\$70,000\.50/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Your rounds' }))
    expect(screen.getByText(/\$70,000\.50/)).toBeInTheDocument()
  })

  it('shows skeletons and not the empty copy while loading', () => {
    const { rerender } = render(<LedgerCard {...card} status="loading" predictions={[]} {...idle} />)
    expect(screen.getByRole('heading', { name: 'Your rounds' })).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
    rerender(<LedgerCard {...card} score={0} wins={0} status="ready" predictions={[]} {...idle} />)
    expect(screen.getByText(/No rounds yet/)).toBeInTheDocument()
  })

  it('keeps loaded rows and offers retry when a later page fails', async () => {
    const onRetry = vi.fn()
    render(
      <LedgerCard
        {...card}
        status="ready"
        predictions={[round()]}
        hasMore
        loadingMore={false}
        pageError
        onLoadMore={() => undefined}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText((_, node) => (
      node?.classList.contains('num') === true
      && (node.textContent ?? '').includes('$70,000.50')
      && (node.textContent ?? '').includes('$70,100.00')
    ))).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && (node.textContent ?? '').includes('Correct, +1'))).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows an error without claiming there are no rounds', () => {
    render(<LedgerCard {...card} status="error" predictions={[]} {...idle} />)
    expect(screen.getByText('Could not load your rounds.')).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
  })

  it('shows the exact prices when rounding hides the difference', () => {
    render(
      <LedgerCard
        {...card}
        score={-1}
        wins={0}
        losses={1}
        status="ready"
        predictions={[round({
          direction: 'DOWN',
          outcome: 'LOSS',
          scoreDelta: -1,
          entryPrice: '65432.101',
          resolutionPrice: '65432.104',
        })]}
        {...idle}
      />,
    )
    expect(screen.getByText('Exact 65432.101 vs 65432.104')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && (node.textContent ?? '').includes('Not this time, −1'))).toBeInTheDocument()
  })

  it('opens the capped list and closes it again', async () => {
    const rows = Array.from({ length: 6 }, (_, index) => round({
      predictionId: `p_000000000000${index}_abcd1234`,
    }))
    render(<LedgerCard {...card} status="ready" predictions={rows} {...idle} />)
    expect(document.querySelector('.hist.is-open')).toBeNull()
    expect(document.getElementById('history-p_0000000000005_abcd1234')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show all 6 rounds' }))
    expect(document.querySelector('.hist.is-open')).toBeTruthy()
    expect(document.getElementById('history-p_0000000000005_abcd1234')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(document.querySelector('.hist.is-open')).toBeNull()
  })

  it('pages on a wide screen without opening the list', async () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(min-width: 960px)',
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })))
    const onLoadMore = vi.fn()
    const rows = Array.from({ length: 6 }, (_, index) => round({
      predictionId: `p_000000000000${index}_abcd1234`,
    }))
    render(
      <LedgerCard
        {...card}
        status="ready"
        predictions={rows}
        hasMore
        loadingMore={false}
        pageError={false}
        onLoadMore={onLoadMore}
        onRetry={() => undefined}
      />,
    )
    expect(document.getElementById('history-p_0000000000005_abcd1234')).toBeTruthy()
    expect(document.querySelector('.hist.is-open')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Show all rounds' }))
    expect(onLoadMore).toHaveBeenCalledOnce()
    expect(document.querySelector('.hist.is-open')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Show fewer' })).not.toBeInTheDocument()
  })

  it('moves focus to the first new row and retries from the button', async () => {
    const user = userEvent.setup()
    const older = round({ predictionId: 'p_0000000000001_abcd1234', direction: 'DOWN', outcome: 'LOSS', scoreDelta: -1 })
    function Harness() {
      const [rows, setRows] = useState<HistoryRound[]>([round()])
      const [failed, setFailed] = useState(true)
      return (
        <LedgerCard
          {...card}
          status="ready"
          predictions={rows}
          hasMore
          loadingMore={false}
          pageError={failed}
          onRetry={() => setFailed(false)}
          onLoadMore={() => {
            setFailed(false)
            setRows((current) => current.length === 1 ? [...current, older] : current)
          }}
        />
      )
    }
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.queryByText('Could not load your rounds.')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show all rounds' }))
    const added = document.getElementById(`history-${older.predictionId}`)
    expect(added).toHaveFocus()
    expect(document.querySelector('.hist.is-open')).toBeTruthy()
  })

  it('renders a negative score beside the running score', () => {
    render(
      <LedgerCard
        score={-2}
        wins={0}
        losses={2}
        status="ready"
        predictions={[round({ direction: 'DOWN', outcome: 'LOSS', scoreDelta: -1 })]}
        {...idle}
      />,
    )
    expect(screen.getByLabelText('Score: -2')).toBeInTheDocument()
    expect(screen.getByText('Score -2')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && (node.textContent ?? '').includes('Not this time, −1'))).toBeInTheDocument()
  })

  it('refetches when a new result arrives', async () => {
    localStorage.setItem('hunch.session', JSON.stringify({ playerId, accessToken: token }))
    let predictions: unknown[] = []
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ predictions, nextCursor: null }),
    })))
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    function Probe({ latest }: { latest: string | null }) {
      const history = useHistory('https://example.test', playerId, latest)
      return <p>{history.predictions.map((row) => row.predictionId).join(',') || history.status}</p>
    }
    const view = render(
      <QueryClientProvider client={client}>
        <Probe latest={null} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('ready')).toBeInTheDocument()
    predictions = [{
      predictionId: 'p_0000000000003_abcd9999',
      playerId,
      direction: 'UP',
      mode: 'STANDARD',
      status: 'RESOLVED',
      createdAt: '2026-10-11T15:00:00.000Z',
      dueAt: '2026-10-11T15:01:00.000Z',
      entryPrice: '100.00',
      entryTradeTime: '2026-10-11T15:00:00.000Z',
      resolvedAt: '2026-10-11T15:01:02.000Z',
      resolutionPrice: '101.00',
      resolutionTradeTime: '2026-10-11T15:01:02.000Z',
      outcome: 'WIN',
      scoreDelta: 1,
    }]
    view.rerender(
      <QueryClientProvider client={client}>
        <Probe latest="p_0000000000003_abcd9999" />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('p_0000000000003_abcd9999')).toBeInTheDocument()
  })
})
