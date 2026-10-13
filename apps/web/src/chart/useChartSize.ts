import { useLayoutEffect, useRef, useState } from 'react'
import type { Size } from './model'

/** The element's content size in CSS pixels, kept current with a ResizeObserver. Zero until measured. */
export function useChartSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState<Size>({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => {
      const { width, height } = element.getBoundingClientRect()
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return { ref, size }
}
