/** One plotted price. `time` is the Coinbase trade time in server milliseconds, never the browser's receive time. */
export interface PriceSample {
  price: string
  time: number
}

/** How long the browser keeps samples. The longest view is an active round, about two minutes. */
export const SAMPLE_WINDOW_MS = 10 * 60 * 1000

/** Merges samples by trade time, oldest first, and drops anything older than the kept window. */
export function mergeSamples(current: PriceSample[], incoming: PriceSample[], now: number): PriceSample[] {
  if (incoming.length === 0) return current
  const byTime = new Map(current.map((sample) => [sample.time, sample]))
  incoming.forEach((sample) => byTime.set(sample.time, sample))
  return [...byTime.values()]
    .filter((sample) => now - sample.time <= SAMPLE_WINDOW_MS)
    .sort((a, b) => a.time - b.time)
}

/** A sample from a trade-time ISO string. */
export function sampleAt(price: string, tradeTime: string): PriceSample {
  return { price, time: Date.parse(tradeTime) }
}
