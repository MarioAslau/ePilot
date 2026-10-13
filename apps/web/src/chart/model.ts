/** What the chart is showing. All times are server milliseconds. */
export type ChartRound = {
  acceptedAt: number
  earliestResolveAt: number
  entryPrice: string
}

export interface ChartWindow {
  start: number
  end: number
}

const IDLE_BACK_MS = 120_000
const LEAD_MS = 4_000
const BEFORE_ENTRY_MS = 45_000
const AFTER_DEADLINE_MS = 10_000

/**
 * Idle: the last two minutes. Active: from 45 s before the entry to 10 s after the earliest result.
 * After the deadline the active window slides with a fixed width instead of stretching.
 */
export function chartWindow(now: number, round?: ChartRound): ChartWindow {
  if (!round) return { start: now - IDLE_BACK_MS, end: now + LEAD_MS }
  const start = round.acceptedAt - BEFORE_ENTRY_MS
  const end = round.earliestResolveAt + AFTER_DEADLINE_MS
  const slidEnd = Math.max(end, now + LEAD_MS)
  return { start: start + (slidEnd - end), end: slidEnd }
}
