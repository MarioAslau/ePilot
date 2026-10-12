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
