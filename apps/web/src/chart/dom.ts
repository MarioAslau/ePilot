/** How painters write to the DOM: each call either shows an element at a position or hides it. */

type Attrs = Record<string, number | string>

/** Shows an SVG element with these attributes (numbers rounded to 0.1 px), or hides it when `attrs` is null. */
export function draw(element: SVGElement | null | undefined, attrs: Attrs | null | false | undefined) {
  if (!element) return
  element.style.display = attrs ? '' : 'none'
  if (!attrs) return
  for (const [name, value] of Object.entries(attrs)) {
    element.setAttribute(name, typeof value === 'number' ? value.toFixed(1) : value)
  }
}

/** Shows an HTML tag at a pixel position, or hides it. Its CSS `translate` sets the anchor. */
export function place(element: HTMLElement | null | undefined, at: { x: number; y: number } | null | false | undefined) {
  if (!element) return
  element.style.display = at ? '' : 'none'
  if (at) element.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`
}

export const at = (x: number, y: number) => ({ transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` })
