import { useEffect, useState, type RefObject } from 'react'
import { findLayoutSlot } from '../layout'

const ROW_FLOOR = 152

/** Open-list cap: the first two stage sections, never the special-round offer. */
export function roundsCap(parts: {
  market: number
  play: number
  offer: number
  score: number
  head: number
  pad: number
}): number {
  const two = parts.market + parts.play - parts.offer
  return Math.max(ROW_FLOOR, Math.round(two - parts.score - parts.head - parts.pad))
}

function height(element: Element): number {
  return element.getBoundingClientRect().height
}

function outerHeight(element: Element): number {
  const style = getComputedStyle(element)
  return height(element) + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0')
}

function verticalPadding(element: Element): number {
  const style = getComputedStyle(element)
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
}

/**
 * The desktop height cap for the round list, so the ledger ends where the stage card does.
 * CSS cannot subtract the offer's height, so this measures the stage and the ledger's own parts.
 */
export function useRoundsCap(
  enabled: boolean,
  own: { score: RefObject<HTMLElement>; rounds: RefObject<HTMLElement>; head: RefObject<HTMLElement> },
): number | null {
  const [cap, setCap] = useState<number | null>(null)
  const { score, rounds, head } = own
  useEffect(() => {
    if (!enabled || typeof ResizeObserver !== 'function') return
    const measure = () => {
      const market = findLayoutSlot('stage-market')
      const play = findLayoutSlot('stage-play')
      if (!market || !play || !score.current) return
      const offer = findLayoutSlot('offer', play)
      const next = roundsCap({
        market: height(market),
        play: height(play),
        offer: offer ? outerHeight(offer) : 0,
        score: height(score.current),
        head: head.current ? height(head.current) : 0,
        pad: rounds.current ? verticalPadding(rounds.current) : 0,
      })
      setCap((current) => (current === next ? current : next))
    }
    const observer = new ResizeObserver(measure)
    for (const element of [findLayoutSlot('stage'), score.current]) {
      if (element) observer.observe(element)
    }
    measure()
    return () => observer.disconnect()
  }, [enabled, score, rounds, head])
  return cap
}
