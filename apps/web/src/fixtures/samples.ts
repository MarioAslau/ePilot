import type { PriceSample } from '../chart/samples'

/**
 * A repeatable one-sample-per-second walk for fixture previews only.
 * It wanders around `around` and lands exactly on `last` at `end`, so the chart agrees with the fixture's latest price.
 */
export function fixtureSamples(around: string, last: string, end: number, seconds = 180, seed = 7): PriceSample[] {
  let state = seed
  const random = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
  const steps: number[] = [0]
  for (let index = 1; index < seconds; index += 1) {
    steps.push((steps[index - 1] ?? 0) + (random() - 0.5) * 7)
  }
  const from = Number(around)
  const to = Number(last)
  const drift = steps[steps.length - 1] ?? 0
  return steps.map((step, index) => {
    const share = index / (seconds - 1)
    return {
      price: (from + (to - from) * share ** 3 + step - drift * share).toFixed(2),
      time: end - (seconds - 1 - index) * 1_000,
    }
  })
}
