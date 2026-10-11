import type { MeResponse, Prediction, WaitReason } from 'contracts'

export type RoundPhase =
  | 'ready'
  | 'recording'
  | 'unknown'
  | 'active'
  | 'checking'
  | 'equal'
  | 'hold'
  | 'result'

export function clockOffset(serverTime: string, startedAt: number, finishedAt: number): number {
  return new Date(serverTime).getTime() - (startedAt + finishedAt) / 2
}

export function secondsRemaining(dueAt: string, offsetMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(dueAt).getTime() - (nowMs + offsetMs)) / 1000))
}

/** 1s near the deadline or while a hold is in progress, 2s for the rest of an active round, 3s when idle. */
export function pollInterval(input: {
  hasActive: boolean
  dueAt?: string
  offsetMs: number
  nowMs: number
  waitReason: WaitReason | null
  offerOpen?: boolean
}): number {
  if (input.hasActive) {
    const remaining = input.dueAt ? secondsRemaining(input.dueAt, input.offsetMs, input.nowMs) : 60
    const holding =
      input.waitReason === 'CHECKING_PRICE' ||
      input.waitReason === 'EQUAL_PRICE' ||
      input.waitReason === 'PROVIDER_HOLD'
    if (remaining <= 5 || holding) return 1_000
    return 2_000
  }
  if (input.offerOpen) return 2_000
  return 3_000
}

export function roundView(input: {
  me: MeResponse | undefined
  placed: Prediction | null
  submitPhase: 'idle' | 'recording' | 'unknown'
  offsetMs: number
  nowMs: number
}): {
  phase: RoundPhase
  active: Prediction | null
  settled: Prediction | null
  remaining: number
} {
  const active =
    input.me?.activePrediction ??
    (input.placed && input.placed.predictionId !== input.me?.latestResolvedPrediction?.predictionId
      ? input.placed
      : null)
  const resolved = input.me?.latestResolvedPrediction
  const settled = !active && resolved?.outcome ? resolved : null
  const remaining = active ? secondsRemaining(active.dueAt, input.offsetMs, input.nowMs) : 0

  if (active) {
    const reason = input.me?.waitReason
    const phase: RoundPhase =
      reason === 'EQUAL_PRICE'
        ? 'equal'
        : reason === 'PROVIDER_HOLD'
          ? 'hold'
          : remaining <= 0 || reason === 'CHECKING_PRICE'
            ? 'checking'
            : 'active'
    return { phase, active, settled: null, remaining }
  }
  if (input.submitPhase === 'recording') return { phase: 'recording', active: null, settled, remaining: 0 }
  if (input.submitPhase === 'unknown') return { phase: 'unknown', active: null, settled, remaining: 0 }
  if (settled) return { phase: 'result', active: null, settled, remaining: 0 }
  return { phase: 'ready', active: null, settled: null, remaining: 0 }
}

export function announcement(
  from: RoundPhase | null,
  to: RoundPhase,
  detail: { direction?: 'UP' | 'DOWN'; entryPrice?: string; outcome?: 'WIN' | 'LOSS'; score?: number },
): string | null {
  if (from === null && to !== 'result') return null
  if (to === 'active' && (from === 'recording' || from === 'unknown')) {
    const direction = detail.direction === 'DOWN' ? 'Down' : 'Up'
    return `Predicted ${direction}. Entry price ${detail.entryPrice}.`
  }
  if (to === 'checking' && from === 'active') return 'Minimum wait complete. Checking the latest price.'
  if (to === 'equal' && from !== 'equal') return 'The latest price equals your entry price. Still waiting.'
  if (to === 'hold' && from !== 'hold') {
    return 'Our price source is temporarily unavailable. Your round is on hold, and an outage never counts as a loss.'
  }
  if (to === 'result' && detail.outcome && detail.score !== undefined) {
    const title = detail.outcome === 'WIN' ? 'Correct' : 'Not this time'
    return `${title}. Score ${detail.score}.`
  }
  return null
}
