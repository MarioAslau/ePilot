import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoreCard } from '../components/ScoreCard'
import { RoundHistory, type HistoryRound } from '../components/RoundHistory'
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

describe('RoundHistory', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('shows skeletons and not the empty copy while loading', () => {
    const { rerender } = render(<RoundHistory status="loading" predictions={[]} {...idle} />)
    expect(screen.getByRole('heading', { name: 'Your rounds' })).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
    rerender(<RoundHistory status="ready" predictions={[]} {...idle} />)
    expect(screen.getByText(/No rounds yet/)).toBeInTheDocument()
  })

  it('keeps loaded rows and offers retry when a later page fails', async () => {
    const onRetry = vi.fn()
    render(
      <RoundHistory
        status="ready"
        predictions={[round()]}
        hasMore
        loadingMore={false}
        pageError
        onLoadMore={() => undefined}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByText(/70,000.50 to 70,100.00/)).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && node.textContent === 'Correct, +1')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows an error without claiming there are no rounds', () => {
    render(<RoundHistory status="error" predictions={[]} {...idle} />)
    expect(screen.getByText('Could not load your rounds.')).toBeInTheDocument()
    expect(screen.queryByText(/No rounds yet/)).not.toBeInTheDocument()
  })

  it('shows the exact prices when rounding hides the difference', () => {
    render(
      <RoundHistory
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
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && node.textContent === 'Not this time, −1')).toBeInTheDocument()
  })

  it('moves focus to the first new row and retries from the button', async () => {
    const user = userEvent.setup()
    const older = round({ predictionId: 'p_0000000000001_abcd1234', direction: 'DOWN', outcome: 'LOSS', scoreDelta: -1 })
    function Harness() {
      const [rows, setRows] = useState<HistoryRound[]>([round()])
      const [failed, setFailed] = useState(true)
      return (
        <RoundHistory
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
    await user.click(screen.getByRole('button', { name: 'Load older rounds' }))
    const added = document.getElementById(`history-${older.predictionId}`)
    expect(added).toHaveFocus()
  })

  it('renders a negative score beside the history row', () => {
    render(
      <>
        <ScoreCard score={-2} wins={0} losses={2} />
        <RoundHistory
          status="ready"
          predictions={[round({ direction: 'DOWN', outcome: 'LOSS', scoreDelta: -1 })]}
          {...idle}
        />
      </>,
    )
    expect(screen.getByLabelText('Score: -2')).toBeInTheDocument()
    expect(screen.getByText('all settled rounds')).toBeInTheDocument()
    expect(screen.getByText((_, node) => node?.classList.contains('hp') === true && node.textContent === 'Not this time, −1')).toBeInTheDocument()
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
