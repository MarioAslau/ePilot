/**
 * Elements the ledger measures to line its round list up with the stage card.
 * Each producer marks itself with `layoutSlot(name)`; only `useRoundsCap` reads them.
 * Styling classes stay free to change.
 */
const ATTRIBUTE = 'data-layout-slot'

export type LayoutSlot = 'stage' | 'stage-market' | 'stage-play' | 'offer'

export function layoutSlot(name: LayoutSlot): Record<string, LayoutSlot> {
  return { [ATTRIBUTE]: name }
}

export function findLayoutSlot(name: LayoutSlot, root: Document | Element = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[${ATTRIBUTE}="${name}"]`)
}
