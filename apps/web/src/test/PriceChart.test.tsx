import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PriceChart } from '../chart/PriceChart'

const round = { direction: 'UP' as const, acceptedAt: 100_000, earliestResolveAt: 160_000, entryPrice: '10' }
const samples = [80_000, 110_000, 120_000, 130_000].map((time, index) => ({ price: String(9 + index), time }))

// jsdom has no PointerEvent, so pointerType and pointerId would be dropped.
class TestPointerEvent extends MouseEvent {
  readonly pointerType: string
  readonly pointerId: number
  constructor(type: string, init: ConstructorParameters<typeof MouseEvent>[1] & { pointerType?: string; pointerId?: number } = {}) {
    super(type, init)
    this.pointerType = init.pointerType ?? 'mouse'
    this.pointerId = init.pointerId ?? 1
  }
}

const tip = () => document.querySelector('.ch-tip b')

// jsdom has no layout; give the chart a size so it paints and can be scrubbed.
beforeEach(() => {
  vi.stubGlobal('PointerEvent', TestPointerEvent)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, left: 0, top: 0, right: 300, bottom: 132, width: 300, height: 132, toJSON: () => ({}),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function renderChart() {
  render(<PriceChart samples={samples} now={135_000} round={round} feed="live" />)
  return screen.getByRole('img', { name: /Your Up call/ })
}

describe('PriceChart', () => {
  it('summarises the round in its label and steps through samples with the keyboard', async () => {
    const chart = renderChart()
    expect(chart).toHaveAttribute('aria-label', expect.stringContaining('Latest $12.00, above your entry, ahead'))
    expect(chart).toHaveAttribute('tabindex', '0')

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(tip()).toHaveTextContent('$12.00')
    fireEvent.keyDown(chart, { key: 'ArrowLeft' })
    expect(tip()).toHaveTextContent('$11.00')
    fireEvent.keyDown(chart, { key: 'ArrowRight' })
    expect(tip()).toHaveTextContent('$12.00')
    fireEvent.keyDown(chart, { key: 'Home' })
    expect(tip()).toHaveTextContent('$9.00')
    expect(screen.getByText('Before your entry')).toBeInTheDocument()

    const live = document.querySelector('[aria-live="polite"]')!
    expect(live).toHaveTextContent('')
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(live).toHaveTextContent(/^\$9\.00 at .+, before your entry$/)

    fireEvent.keyDown(chart, { key: 'Escape' })
    expect(tip()).toBeNull()
  })

  it('starts scrubbing on touch only after a 250 ms hold, so a swipe still scrolls', async () => {
    const chart = renderChart()
    // Pointer scrubbing reads the painted scale, so let one frame paint first.
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    fireEvent.pointerDown(chart, { pointerType: 'touch', pointerId: 1, clientX: 290, clientY: 50 })
    fireEvent.pointerMove(chart, { pointerType: 'touch', pointerId: 1, clientX: 290, clientY: 80 })
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(tip()).toBeNull()

    fireEvent.pointerDown(chart, { pointerType: 'touch', pointerId: 2, clientX: 290, clientY: 50 })
    await act(async () => { vi.advanceTimersByTime(249) })
    expect(tip()).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(tip()).toHaveTextContent('$12.00')

    fireEvent.pointerCancel(chart, { pointerType: 'touch', pointerId: 2 })
    expect(tip()).toBeNull()
  })

  it('opens the samples as a table', () => {
    renderChart()
    const details = screen.getByText('View as table').closest('details')!
    details.open = true
    fireEvent(details, new Event('toggle'))
    expect(screen.getAllByRole('row')).toHaveLength(samples.length + 1)
    expect(screen.getByText('Before entry')).toBeInTheDocument()
  })
})
