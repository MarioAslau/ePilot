import type { Direction, Prediction } from 'contracts'
import { useRef, useState } from 'react'
import { postPrediction } from './api'
import type { Session } from './session'

const RETRY_MS = [1_000, 2_000, 4_000]

export function usePrediction(
  baseUrl: string,
  session: Session | null,
  onFinished: (outcome: 'placed' | 'rejected') => void,
  onReconcile?: () => void,
) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'unknown'>('idle')
  const [notice, setNotice] = useState<string | null>(null)
  const [canRetry, setCanRetry] = useState(false)
  const [placed, setPlaced] = useState<Prediction | null>(null)
  const [serverPriced, setServerPriced] = useState(false)
  const pending = useRef<{ key: string; direction: Direction } | null>(null)
  const displayed = useRef<string | null>(null)
  const attempts = useRef(0)
  const locked = useRef(false)

  async function attempt(direction: Direction, displayedPrice: string | null) {
    if (!session) return
    const key = pending.current?.key ?? crypto.randomUUID()
    pending.current = { key, direction }
    displayed.current = displayedPrice
    locked.current = true
    setCanRetry(false)
    setPhase('recording')
    setNotice('Recording entry')

    const result = await postPrediction(baseUrl, session, direction, key)
    if (result.kind === 'ok') {
      pending.current = null
      attempts.current = 0
      locked.current = false
      setPhase('idle')
      setNotice(null)
      setPlaced(result.value)
      setServerPriced(displayedPrice !== null && result.value.entryPrice !== displayedPrice)
      onFinished('placed')
      return
    }
    if (result.kind === 'rejected') {
      pending.current = null
      attempts.current = 0
      locked.current = false
      setPhase('idle')
      setNotice(
        result.code === 'PROVIDER_UNAVAILABLE'
          ? 'Not placed. The price source is unavailable.'
          : result.code === 'ACTIVE_ROUND'
            ? null
            : 'Not placed.',
      )
      onFinished('rejected')
      return
    }

    setPhase('unknown')
    setNotice('Checking whether your prediction was recorded…')
    onReconcile?.()
    if (attempts.current < RETRY_MS.length) {
      const delay = RETRY_MS[attempts.current] ?? 4_000
      attempts.current += 1
      await new Promise((resolve) => setTimeout(resolve, delay))
      await attempt(direction, displayedPrice)
      return
    }
    setCanRetry(true)
  }

  function submit(direction: Direction, displayedPrice: string | null) {
    if (!session || locked.current) return
    pending.current = null
    attempts.current = 0
    void attempt(direction, displayedPrice)
  }

  function retry() {
    if (!pending.current) return
    attempts.current = 0
    void attempt(pending.current.direction, displayed.current)
  }

  return {
    phase,
    notice,
    canRetry,
    placed,
    serverPriced,
    submit,
    retry,
  }
}
