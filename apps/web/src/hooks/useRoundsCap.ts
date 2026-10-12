import { useLayoutEffect, useState, type RefObject } from 'react'
import { findLayoutSlot } from '../layout'

const ROW_FLOOR = 152

/** Room for the open list so the ledger ends with the stage, ignoring the offer. */
export function roundsCap(parts: {
  stageBottom: number
  listTop: number
  offer: number
  below: number
}): number {
  const room = parts.stageBottom - parts.listTop - parts.offer - parts.below
  return Math.max(ROW_FLOOR, Math.round(room))
}

function outerHeight(element: Element): number {
  const style = getComputedStyle(element)
  const box = element.getBoundingClientRect()
  return box.height + parseFloat(style.marginTop || '0') + parseFloat(style.marginBottom || '0')
}

/** Padding and the load-more control that sit under the scrolling list. */
function trail(rounds: HTMLElement): number {
  const pad = parseFloat(getComputedStyle(rounds).paddingBottom) || 0
  const more = rounds.querySelector('.hist-more')
  return pad + (more ? outerHeight(more) : 0)
}

/**
 * Desktop cap for the open round list, so the ledger ends where the stage card does.
 * The offer lives inside the stage, and CSS cannot subtract it.
 */
export function useRoundsCap(
  enabled: boolean,
  own: { score: RefObject<HTMLElement | null>; rounds: RefObject<HTMLElement | null> },
): number | null {
  const [cap, setCap] = useState<number | null>(null)
  const { score, rounds } = own
  useLayoutEffect(() => {
    if (!enabled || typeof ResizeObserver !== 'function') return
    const measure = () => {
      const stage = findLayoutSlot('stage')
      const list = rounds.current?.querySelector('.hist-scroll')
      if (!stage || !list || !rounds.current) return
      const offer = findLayoutSlot('offer')
      const next = roundsCap({
        stageBottom: stage.getBoundingClientRect().bottom,
        listTop: list.getBoundingClientRect().top,
        offer: offer ? outerHeight(offer) : 0,
        below: trail(rounds.current),
      })
      setCap((current) => (current === next ? current : next))
    }
    const observer = new ResizeObserver(measure)
    for (const element of [findLayoutSlot('stage'), score.current, rounds.current]) {
      if (element) observer.observe(element)
    }
    measure()
    return () => observer.disconnect()
  }, [enabled, score, rounds])
  return cap
}
