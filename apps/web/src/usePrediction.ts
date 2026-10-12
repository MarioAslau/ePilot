import type { Direction, ErrorCode, Prediction } from 'contracts'
import { useRef, useState } from 'react'
import { postPrediction } from './api'
import type { Session } from './session'

const RETRY_MS = [1_000, 2_000, 4_000]

/** Where a submission is. `unknown`: no answer arrived, so it is reconciled before anything new. */
type Status =
  | { kind: 'idle'; rejected: ErrorCode | null }
  | { kind: 'recording' }
  | { kind: 'unknown'; canRetry: boolean }

function noticeFor(status: Status): string | null {
  if (status.kind === 'unknown') return 'Checking whether your prediction was recorded…'
  if (status.kind !== 'idle' || !status.rejected) return null
  if (status.rejected === 'PROVIDER_UNAVAILABLE') return 'Not placed. The price source is unavailable.'
  // The existing round is shown instead.
  if (status.rejected === 'ACTIVE_ROUND') return null
  return 'Not placed.'
}

export function usePrediction(
  baseUrl: string,
  session: Session | null,
  onFinished: (outcome: 'placed' | 'rejected') => void,
  onReconcile: () => void,
) {
  const [status, setStatus] = useState<Status>({ kind: 'idle', rejected: null })
  const [placed, setPlaced] = useState<Prediction | null>(null)
  const [serverPriced, setServerPriced] = useState(false)
  /** The key and direction to reuse until the server answers, so a retry cannot create a second round. */
  const pending = useRef<{ key: string; direction: Direction; displayedPrice: string | null } | null>(null)
  const attempts = useRef(0)

  async function attempt() {
    const current = pending.current
    if (!session || !current) return
    setStatus({ kind: 'recording' })

    const result = await postPrediction(baseUrl, session, current.direction, current.key)
    if (result.kind !== 'unknown') {
      pending.current = null
      attempts.current = 0
      if (result.kind === 'ok') {
        setStatus({ kind: 'idle', rejected: null })
        setPlaced(result.value)
        setServerPriced(current.displayedPrice !== null && result.value.entryPrice !== current.displayedPrice)
        onFinished('placed')
      } else {
        setStatus({ kind: 'idle', rejected: result.code })
        onFinished('rejected')
      }
      return
    }

    onReconcile()
    const delay = RETRY_MS[attempts.current]
    if (delay === undefined) {
      setStatus({ kind: 'unknown', canRetry: true })
      return
    }
    setStatus({ kind: 'unknown', canRetry: false })
    attempts.current += 1
    await new Promise((resolve) => setTimeout(resolve, delay))
    await attempt()
  }

  function submit(direction: Direction, displayedPrice: string | null) {
    if (!session || pending.current) return
    pending.current = { key: crypto.randomUUID(), direction, displayedPrice }
    attempts.current = 0
    void attempt()
  }

  function retry() {
    if (!pending.current) return
    attempts.current = 0
    void attempt()
  }

  return {
    phase: status.kind,
    notice: noticeFor(status),
    canRetry: status.kind === 'unknown' && status.canRetry,
    placed,
    serverPriced,
    submit,
    retry,
  }
}
