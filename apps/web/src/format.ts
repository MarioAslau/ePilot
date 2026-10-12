import type { Direction } from 'contracts'

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatUsd(raw: string | null | undefined): string {
  if (raw == null || raw === '') return '—'
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  return usd.format(n)
}

/** Price move with an explicit sign. A fall is −$1.00, a rise is +$1.00. */
export function formatMove(delta: number): string {
  const body = usd.format(Math.abs(delta))
  if (delta > 0) return `+${body}`
  if (delta < 0) return `−${body}`
  return body
}

/** Wall-clock time, for example 02:15:09 PM. */
export function formatTime(at: Date | string | number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Whole seconds as m:ss. */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Points with a sign and a true minus: +2, −1. */
export function signedPoints(points: number): string {
  return points > 0 ? `+${points}` : `−${Math.abs(points)}`
}

/** Points for screen readers: plus 2, minus 1. */
export function spokenPoints(points: number): string {
  return points > 0 ? `plus ${points}` : `minus ${Math.abs(points)}`
}

export function directionWord(direction: Direction): 'Up' | 'Down' {
  return direction === 'UP' ? 'Up' : 'Down'
}

/** Short round label, for example #ABCD12. */
export function roundLabel(predictionId: string): string {
  return `#${predictionId.slice(-6).toUpperCase()}`
}
