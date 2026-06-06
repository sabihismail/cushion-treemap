import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  THEMES, DEFAULT_THEME, CATEGORY_KEYS,
  getTheme, resolveSystemThemeName,
  hexToRgb, luminance, categoryForName, fmtBytes,
  CushionTreemap,
  type CategoryKey, type TreemapNode,
} from '../src/index'

// ─── hexToRgb ─────────────────────────────────────────────────────────────────

test('hexToRgb parses 6-digit hex', () => {
  assert.deepEqual(hexToRgb('#1e1e2e'), [30, 30, 46])
  assert.deepEqual(hexToRgb('1e1e2e'), [30, 30, 46]) // no leading #
  assert.deepEqual(hexToRgb('#ffffff'), [255, 255, 255])
  assert.deepEqual(hexToRgb('#000000'), [0, 0, 0])
})

test('hexToRgb expands 3-digit shorthand', () => {
  assert.deepEqual(hexToRgb('#fff'), [255, 255, 255])
  assert.deepEqual(hexToRgb('#f09'), [255, 0, 153])
})

// ─── luminance ────────────────────────────────────────────────────────────────

test('luminance: white > mid > black', () => {
  assert.ok(luminance([255, 255, 255]) > luminance([128, 128, 128]))
  assert.ok(luminance([128, 128, 128]) > luminance([0, 0, 0]))
  assert.equal(luminance([0, 0, 0]), 0)
})

// ─── categoryForName ──────────────────────────────────────────────────────────

test('categoryForName classifies by extension, case-insensitive', () => {
  const cases: [string, CategoryKey][] = [
    ['movie.mp4', 'video'],
    ['song.MP3', 'audio'],
    ['photo.PNG', 'images'],
    ['main.rs', 'code'],
    ['notes.md', 'docs'],
    ['backup.zip', 'archives'],
    ['setup.exe', 'executables'],
    ['data.unknownxyz', 'other'],
    ['README', 'other'],          // no extension
    ['weird.', 'other'],          // trailing dot
  ]
  for (const [name, expected] of cases) {
    assert.equal(categoryForName(name), expected, `${name} → ${expected}`)
  }
})

// ─── theme registry integrity ─────────────────────────────────────────────────

test('every theme has all 8 categories as valid hex', () => {
  const hex6 = /^#[0-9a-fA-F]{6}$/
  for (const t of THEMES) {
    for (const k of CATEGORY_KEYS) {
      const v = t.categories[k]
      assert.ok(v, `${t.name} missing category ${k}`)
      assert.match(v, hex6, `${t.name}.${k}="${v}" not 6-digit hex`)
    }
    for (const field of ['background', 'header', 'text', 'border', 'folder', 'file'] as const) {
      assert.match(t[field], hex6, `${t.name}.${field}="${t[field]}" not 6-digit hex`)
    }
  }
})

test('every theme has numeric cushion params and a valid mode', () => {
  for (const t of THEMES) {
    assert.ok(t.mode === 'light' || t.mode === 'dark', `${t.name} mode`)
    const c = t.cushion
    for (const f of ['lightX', 'lightY', 'lightZ', 'height', 'scaleFactor', 'ambient'] as const) {
      assert.equal(typeof c[f], 'number', `${t.name}.cushion.${f}`)
      assert.ok(Number.isFinite(c[f]), `${t.name}.cushion.${f} finite`)
    }
    assert.ok(c.ambient >= 0 && c.ambient <= 1, `${t.name} ambient in [0,1]`)
  }
})

test('theme names are unique', () => {
  const names = THEMES.map(t => t.name)
  assert.equal(new Set(names).size, names.length, 'duplicate theme name')
})

test('Manila (SpaceSniffer) theme is registered with two-tone colors', () => {
  const m = getTheme('Manila')
  assert.ok(m, 'Manila theme exists')
  // two-tone fills must differ so folders and files are visually distinct
  assert.notEqual(m!.folder, m!.file, 'folder and file colors differ')
})

test('every theme has distinct folder vs file fills', () => {
  for (const t of THEMES) {
    assert.notEqual(t.folder, t.file, `${t.name}: folder and file colors must differ`)
  }
})

// ─── getTheme / resolveSystemThemeName ────────────────────────────────────────

test('getTheme finds by name, undefined otherwise', () => {
  assert.equal(getTheme('Nord')?.name, 'Nord')
  assert.equal(getTheme('Does Not Exist'), undefined)
})

test('DEFAULT_THEME is the first registered theme', () => {
  assert.equal(DEFAULT_THEME, THEMES[0])
  assert.equal(DEFAULT_THEME.name, 'Catppuccin Mocha')
})

test('resolveSystemThemeName falls back to a real theme without window', () => {
  // In Node there is no window — must return a name that resolves.
  const name = resolveSystemThemeName()
  assert.ok(getTheme(name), `resolved "${name}" is a registered theme`)
})

// ─── fmtBytes ─────────────────────────────────────────────────────────────────

test('fmtBytes scales units', () => {
  assert.equal(fmtBytes(512), '512 B')
  assert.equal(fmtBytes(2048), '2 KB')
  assert.equal(fmtBytes(5 * 1e6), '5.0 MB')
  assert.equal(fmtBytes(3.2 * 1e9), '3.2 GB')
  assert.equal(fmtBytes(1.5 * 1e12), '1.5 TB')
})

// ─── setData({ animate }) — flashing-fix regression ─────────────────────────────
//
// The bug: a live scan calls setData() many times/sec merging batches into the
// SAME dataset. setData unconditionally reset appear=0 (fade-from-background),
// so every incremental update re-triggered the fade → constant flashing.
// Fix: setData(root, { animate: false }) skips the fade (appear=1, plain repaint);
// animate defaults true for genuine new datasets (initial open / drive switch).
//
// Observable proxy for "is the fade running": render() draws a full-canvas dim
// overlay via ctx.fillRect(0,0,W,H) ONLY while appear < 1. fillRect is used
// nowhere else, so its call count == fade frames painted.

// A forgiving 2D-context stub: real impls for the data-returning calls, a
// recording no-op for everything else (fillRect, strokeRect, save, …).
function makeMockCtx() {
  const calls: Record<string, number> = {}
  const target: Record<string, unknown> = {
    createImageData: (w: number, h: number) =>
      ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) }),
    getImageData: (_x: number, _y: number, w: number, h: number) =>
      ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h) * 4) }),
    measureText: () => ({ width: 8 }),
  }
  const ctx = new Proxy(target, {
    get(t, prop: string) {
      if (prop in t) return (t as Record<string, unknown>)[prop]
      return (..._args: unknown[]) => { calls[prop] = (calls[prop] ?? 0) + 1 }
    },
    set(t, prop: string, val) { (t as Record<string, unknown>)[prop] = val; return true },
  })
  return { ctx, calls }
}

function makeMockCanvas(ctx: unknown) {
  return {
    width: 240, height: 160,
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 160 }),
  } as unknown as HTMLCanvasElement
}

const SAMPLE_ROOT: TreemapNode = {
  name: 'root', value: 100,
  children: [{ name: 'a', value: 60 }, { name: 'b', value: 40 }],
}

// Run requestAnimationFrame callbacks synchronously, capped so the fade loop
// (which schedules itself until appear hits 1) can't spin forever in the test.
function withSyncRaf(budget: number, fn: () => void) {
  const g = globalThis as Record<string, unknown>
  const prevRaf = g.requestAnimationFrame
  const prevCancel = g.cancelAnimationFrame
  let left = budget
  g.requestAnimationFrame = (cb: (t: number) => void) => {
    if (left-- > 0) cb(typeof performance !== 'undefined' ? performance.now() : 0)
    return 1
  }
  g.cancelAnimationFrame = () => {}
  try { fn() } finally {
    g.requestAnimationFrame = prevRaf
    g.cancelAnimationFrame = prevCancel
  }
}

test('setData({ animate: false }) skips the fade (no flash on incremental update)', () => {
  const { ctx, calls } = makeMockCtx()
  const tm = new CushionTreemap<TreemapNode>(makeMockCanvas(ctx), { theme: THEMES[0] })
  withSyncRaf(4, () => { tm.setData(SAMPLE_ROOT, { animate: false }); tm.destroy() })
  assert.ok((calls.putImageData ?? 0) >= 1, 'a repaint happened')
  assert.equal(calls.fillRect ?? 0, 0, 'no fade-dim overlay drawn when animate:false')
})

test('setData(root) fades by default (new dataset)', () => {
  const { ctx, calls } = makeMockCtx()
  const tm = new CushionTreemap<TreemapNode>(makeMockCanvas(ctx), { theme: THEMES[0] })
  withSyncRaf(6, () => { tm.setData(SAMPLE_ROOT); tm.destroy() })
  assert.ok((calls.fillRect ?? 0) >= 1, 'fade-dim overlay drawn at least once when animating')
})

test('engine-level animate:false disables fade even without per-call opt', () => {
  const { ctx, calls } = makeMockCtx()
  const tm = new CushionTreemap<TreemapNode>(makeMockCanvas(ctx), { theme: THEMES[0], animate: false })
  withSyncRaf(4, () => { tm.setData(SAMPLE_ROOT); tm.destroy() })   // default opt would normally fade
  assert.equal(calls.fillRect ?? 0, 0, 'engine animate:false suppresses fade regardless of opts')
})

// ─── onContextMenu (right-click) hook ───────────────────────────────────────────
//
// DiskSniffer right-clicks a tile to open its own "Open folder / Reveal in Explorer"
// menu. The engine must (a) fire onContextMenu with the tile under the cursor and
// (b) call preventDefault so the browser's native menu doesn't also appear — but
// ONLY when a handler is registered, otherwise the native menu must stay intact.

// A canvas that actually records event listeners so we can dispatch to them.
function makeListenerCanvas(ctx: unknown) {
  const listeners: Record<string, Array<(e: unknown) => void>> = {}
  return {
    width: 240, height: 160,
    getContext: () => ctx,
    addEventListener(type: string, fn: (e: unknown) => void) { (listeners[type] ??= []).push(fn) },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      listeners[type] = (listeners[type] ?? []).filter(f => f !== fn)
    },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 160 }),
    __fire(type: string, ev: unknown) { (listeners[type] ?? []).forEach(fn => fn(ev)) },
  } as unknown as HTMLCanvasElement & { __fire(type: string, ev: unknown): void }
}

test('onContextMenu fires on right-click and suppresses the native menu', () => {
  const { ctx } = makeMockCtx()
  const canvas = makeListenerCanvas(ctx)
  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  let fired = 0, prevented = 0
  tm.onContextMenu = () => { fired++ }
  withSyncRaf(6, () => {
    tm.setData(SAMPLE_ROOT, { animate: false })
    ;(canvas as unknown as { __fire(t: string, e: unknown): void })
      .__fire('contextmenu', { clientX: 120, clientY: 80, preventDefault: () => { prevented++ } })
    tm.destroy()
  })
  assert.equal(fired, 1, 'onContextMenu called once on right-click')
  assert.equal(prevented, 1, 'preventDefault called → native browser menu suppressed')
})

test('right-click leaves the native menu intact when no onContextMenu handler is set', () => {
  const { ctx } = makeMockCtx()
  const canvas = makeListenerCanvas(ctx)
  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  let prevented = 0
  withSyncRaf(6, () => {
    tm.setData(SAMPLE_ROOT, { animate: false })
    ;(canvas as unknown as { __fire(t: string, e: unknown): void })
      .__fire('contextmenu', { clientX: 120, clientY: 80, preventDefault: () => { prevented++ } })
    tm.destroy()
  })
  assert.equal(prevented, 0, 'no handler → preventDefault NOT called, native menu stays')
})
