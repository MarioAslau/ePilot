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
  /** Deadline of the active round, or null when there is none. */
  activeDueAt: string | null
  offsetMs: number
  nowMs: number
  waitReason: WaitReason | null
  offerOpen?: boolean
}): number {
  if (input.activeDueAt) {
    const remaining = secondsRemaining(input.activeDueAt, input.offsetMs, input.nowMs)
    const holding = input.waitReason !== null && input.waitReason !== 'WAITING_FOR_DEADLINE'
    if (remaining <= 5 || holding) return 1_000
    return 2_000
  }
  if (input.offerOpen) return 2_000
  return 3_000
}

const ACTIVE_PHASE: Record<WaitReason, RoundPhase> = {
  WAITING_FOR_DEADLINE: 'active',
  CHECKING_PRICE: 'checking',
  EQUAL_PRICE: 'equal',
  PROVIDER_HOLD: 'hold',
}

/** Phases that show the round ticket. */
export const TICKET_PHASES: ReadonlySet<RoundPhase> = new Set(Object.values(ACTIVE_PHASE))

/** The ledger's one-word state for a pending round. */
export function ledgerPhase(reason: WaitReason): 'waiting' | 'comparing' | 'hold' {
  if (reason === 'PROVIDER_HOLD') return 'hold'
  return reason === 'WAITING_FOR_DEADLINE' ? 'waiting' : 'comparing'
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
  /** Why the active round has not settled. Null without an active round. */
  waitReason: WaitReason | null
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
    // A countdown at zero is already being compared, even before the server says so.
    const waitReason: WaitReason =
      reason === 'EQUAL_PRICE' || reason === 'PROVIDER_HOLD'
        ? reason
        : remaining <= 0 || reason === 'CHECKING_PRICE'
          ? 'CHECKING_PRICE'
          : 'WAITING_FOR_DEADLINE'
    return { phase: ACTIVE_PHASE[waitReason], active, waitReason, settled: null, remaining }
  }
  const idle = { active: null, waitReason: null, remaining: 0 }
  if (input.submitPhase === 'recording') return { ...idle, phase: 'recording', settled }
  if (input.submitPhase === 'unknown') return { ...idle, phase: 'unknown', settled }
  if (settled) return { ...idle, phase: 'result', settled }
  return { ...idle, phase: 'ready', settled: null }
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
