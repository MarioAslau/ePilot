import { useSyncExternalStore } from 'react'

const DESK = '(min-width: 960px)'

/** True at the two-column desktop breakpoint. */
export function useDesk(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia?.(DESK)
      if (!query) return () => undefined
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia?.(DESK)?.matches ?? false,
    () => false,
  )
}
