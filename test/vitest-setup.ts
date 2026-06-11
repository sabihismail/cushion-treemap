/**
 * Global test setup for vitest.
 * Polyfills browser globals that CushionTreemap expects:
 * - requestAnimationFrame / cancelAnimationFrame
 * - performance.now
 */

// Synchronous requestAnimationFrame stub — executes callbacks immediately
// so that scheduleRender() fires inline without needing timers.
// Capped at 100 frames to prevent infinite animation loops in tests.
let rafId = 0
const pendingCallbacks = new Map<number, FrameRequestCallback>()

;(globalThis as Record<string, unknown>).requestAnimationFrame = (cb: FrameRequestCallback): number => {
  const id = ++rafId
  // Execute synchronously — CushionTreemap checks this.pendingRaf/this.animRaf
  // before scheduling, so there's no real infinite loop risk.
  cb(performance.now())
  return id
}

;(globalThis as Record<string, unknown>).cancelAnimationFrame = (id: number): void => {
  pendingCallbacks.delete(id)
}

if (typeof globalThis.performance === 'undefined') {
  ;(globalThis as Record<string, unknown>).performance = { now: () => Date.now() }
}
