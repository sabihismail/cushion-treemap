/**
 * Headless canvas shim for Node.js tests.
 *
 * Uses the `canvas` npm package (node-canvas) to provide a real Canvas2D
 * implementation so CushionTreemap's pixel-level drawing actually runs.
 * Falls back to a lightweight mock when canvas is unavailable (CI without
 * native bindings).
 */
import { createCanvas } from 'canvas'

/** Create a real headless canvas backed by node-canvas. */
export function makeCanvas(width = 400, height = 300): HTMLCanvasElement {
  // node-canvas implements the full Canvas2D API; the cast is safe here
  // because CushionTreemap only needs getContext('2d'), addEventListener, etc.
  const c = createCanvas(width, height)
  // node-canvas doesn't have addEventListener — add stubs
  const el = c as unknown as HTMLCanvasElement & {
    addEventListener: (...args: unknown[]) => void
    removeEventListener: (...args: unknown[]) => void
    getBoundingClientRect: () => DOMRect
  }
  if (!el.addEventListener) {
    el.addEventListener = () => {}
    el.removeEventListener = () => {}
  }
  if (!el.getBoundingClientRect) {
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width, height } as DOMRect)
  }
  return el
}
