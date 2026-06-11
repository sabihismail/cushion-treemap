import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  THEMES, DEFAULT_THEME, CATEGORY_KEYS,
  getTheme, resolveSystemThemeName,
  hexToRgb, luminance, categoryForName, fmtBytes,
  CushionTreemap, pixelSpan, stripAdvance, validateRoot,
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

// ─── REGRESSION: NaN propagation in squarify strip advance ──────────────────────
//
// Bug (ct-nan-squarify): the strip advance after flushing a row was the raw
// expression `vx0 += (rowSum / remainingTotal) * vW`. When remainingTotal drains
// to 0 (the final row exactly consumes the remaining area, or FP drift overshoots)
// the division is Infinity/NaN and silently poisons every later tile's x/y/w/h.
// The fix routes the advance through stripAdvance(), which guards `remainingTotal
// > 0` and always returns finite dx/dy. These cases divide by exactly 0 / by a
// negative drift value — they FAIL against the pre-fix inline math (Infinity/NaN)
// and PASS with the guard.

test('stripAdvance returns finite 0 when the final row exactly exhausts remaining area', () => {
  // remainingTotal === rowSum on the last row → after this flush it would be 0;
  // the OLD code divided by a remainingTotal that drift could land on exactly 0.
  const a = stripAdvance(5, 0, 800, 600)         // exact zero → old: Infinity
  assert.ok(Number.isFinite(a.dx) && Number.isFinite(a.dy), 'zero remainingTotal → finite advance')
  assert.equal(a.dx, 0); assert.equal(a.dy, 0)

  const neg = stripAdvance(5, -1e-12, 800, 600)  // drift overshoot → old: negative*huge or NaN territory
  assert.ok(Number.isFinite(neg.dx) && Number.isFinite(neg.dy), 'negative remainingTotal → finite advance')
  assert.equal(neg.dx, 0); assert.equal(neg.dy, 0)
})

test('stripAdvance computes the normal share along the longer side', () => {
  // Wide region (vW >= vH): advance along x by the row's fractional share.
  assert.deepEqual(stripAdvance(25, 100, 800, 600), { dx: 0.25 * 800, dy: 0 })
  // Tall region (vW < vH): advance along y.
  assert.deepEqual(stripAdvance(25, 100, 400, 600), { dx: 0, dy: 0.25 * 600 })
})

interface InspectableLayoutNode {
  x0: number; y0: number; x1: number; y1: number
  children: InspectableLayoutNode[]
}

function allRects(nodes: InspectableLayoutNode[], acc: InspectableLayoutNode[] = []): InspectableLayoutNode[] {
  for (const n of nodes) {
    acc.push(n)
    if (n.children?.length) allRects(n.children, acc)
  }
  return acc
}

test('squarify produces finite coords when the final row exactly exhausts the area', () => {
  const { ctx } = makeMockCtx()
  // A canvas big enough that all leaves clear minPx, and enough siblings that
  // multiple rows are flushed (so remainingTotal is decremented repeatedly).
  const canvas = {
    width: 800, height: 600,
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  } as unknown as HTMLCanvasElement

  // Values chosen so the running float subtraction (remainingTotal -= rowSum) can
  // reach ~0 on the final row. Many equal-ish leaves → several rows.
  const children: TreemapNode[] = []
  for (let i = 0; i < 24; i++) children.push({ name: `leaf${i}`, value: 0.1 })
  const root: TreemapNode = { name: 'root', value: 2.4, children }

  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  withSyncRaf(4, () => {
    tm.setData(root, { animate: false })

    // @ts-expect-error — reach into private layout for the assertion (test-only).
    const rects = allRects(tm.layout as InspectableLayoutNode[])
    assert.ok(rects.length > 1, 'layout produced multiple tiles')
    for (const r of rects) {
      for (const [k, v] of Object.entries({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })) {
        assert.ok(Number.isFinite(v), `tile coord ${k}=${v} must be finite (no NaN/Infinity)`)
      }
      const w = r.x1 - r.x0, h = r.y1 - r.y0
      assert.ok(Number.isFinite(w) && Number.isFinite(h), `tile w/h must be finite (w=${w}, h=${h})`)
    }
    tm.destroy()
  })
})

// ─── REGRESSION: ImageData out-of-bounds write (pixel-span clamp) ────────────────
//
// Bug (ct-imagedata-oob): px1/py1 = Math.round(edge) can round UP to size+1
// (e.g. round(W - 0.4) === W is fine, but a tile edge at W + 0.4 → W+1), so the
// inner pixel loop writes one index past the Uint8ClampedArray, silently
// corrupting the first pixel of the next row. The clamp helper must never return
// an upper bound exceeding `size`, on BOTH the x and y axes.

test('pixelSpan clamps the upper bound to canvas size (x and y)', () => {
  // Edge fractionally above the boundary would round up past the buffer.
  assert.deepEqual(pixelSpan(0, 800.4, 800), [0, 800], 'x1 clamped to width, not 801')
  assert.deepEqual(pixelSpan(0, 600.6, 600), [0, 600], 'y1 clamped to height, not 601')
  // The realistic FP-drift case: round(size - 0.4) === size (already at the edge),
  // and anything above stays clamped.
  assert.deepEqual(pixelSpan(0, 800 - 0.4, 800), [0, 800], 'edge at size stays size')
  assert.deepEqual(pixelSpan(0, 1000, 800), [0, 800], 'far overshoot clamped')
  // Lower bound never goes negative.
  assert.deepEqual(pixelSpan(-5, 10, 800), [0, 10], 'lo clamped to 0')
})

test('pixelSpan guarantees the max write index stays within the ImageData buffer', () => {
  // Simulate the worst case: a tile whose right edge sits just past the canvas.
  const W = 240, H = 160
  const buf = new Uint8ClampedArray(W * H * 4)
  const [px0, px1] = pixelSpan(0, W + 0.4, W)   // would be W+1 without the clamp
  const [py0, py1] = pixelSpan(0, H + 0.4, H)
  // Highest index the (base + ix) << 2 write can touch, +3 for alpha.
  const maxIdx = ((py1 - 1) * W + (px1 - 1)) * 4 + 3
  assert.ok(px0 >= 0 && py0 >= 0, 'lower bounds non-negative')
  assert.equal(px1, W, 'x upper bound clamped to width')
  assert.equal(py1, H, 'y upper bound clamped to height')
  assert.ok(maxIdx < buf.length, `max write index ${maxIdx} stays < buffer length ${buf.length}`)
})

// ─── REGRESSION: getContext('2d') null → descriptive throw ───────────────────────
//
// Bug (ct-getcontext-null): the constructor used `getContext('2d')!`, which throws
// an opaque "Cannot read properties of null" when 2D is unavailable (WebGL-bound
// canvas, low-memory Safari, many test/headless environments). The constructor
// must instead throw a clear, descriptive Error.

// ─── REGRESSION: validateRoot — value:0 / missing name ───────────────────────
//
// Bug (ct-zero-root): setData({name: undefined, value: 0}) rendered 'undefined'
// labels and passed NaN/0 into layout arithmetic. validateRoot normalises both
// before layout runs.

test('validateRoot: missing name replaced with (unnamed)', () => {
  // Simulate `name` being undefined at runtime (e.g. from a JS consumer).
  const node = { name: undefined as unknown as string, value: 100 }
  const result = validateRoot(node)
  assert.equal(result.name, '(unnamed)', 'undefined name → "(unnamed)"')
  assert.equal(result.value, 100, 'value unchanged')
})

test('validateRoot: value:0 kept as-is (valid degenerate root)', () => {
  const node: TreemapNode = { name: 'root', value: 0, children: [{ name: 'a', value: 10 }] }
  const result = validateRoot(node)
  assert.equal(result.name, 'root')
  assert.equal(result.value, 0, 'value:0 is valid — layout reads children totals, not root.value')
})

test('validateRoot: NaN value clamped to 0', () => {
  const node = { name: 'root', value: NaN }
  const result = validateRoot(node)
  assert.equal(result.value, 0, 'NaN clamped to 0')
})

test('validateRoot: negative value clamped to 0', () => {
  const node = { name: 'root', value: -42 }
  const result = validateRoot(node)
  assert.equal(result.value, 0, 'negative clamped to 0')
})

test('validateRoot: valid node returned unchanged (identity shortcut)', () => {
  const node: TreemapNode = { name: 'good', value: 50 }
  const result = validateRoot(node)
  assert.strictEqual(result, node, 'same reference returned when no fix needed')
})

test('setData with undefined name does not render "undefined" label', () => {
  const { ctx } = makeMockCtx()
  const canvas = makeMockCanvas(ctx)
  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  // Pass root with undefined name — should not throw, and layout should proceed.
  const badRoot = { name: undefined as unknown as string, value: 100, children: [{ name: 'child', value: 100 }] }
  assert.doesNotThrow(() => {
    withSyncRaf(4, () => { tm.setData(badRoot as unknown as TreemapNode, { animate: false }); tm.destroy() })
  }, 'setData with undefined name must not throw')
})

test('setData with value:0 root and positive children lays out normally', () => {
  const { ctx } = makeMockCtx()
  const canvas = {
    width: 400, height: 300,
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 300 }),
  } as unknown as HTMLCanvasElement
  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  const root: TreemapNode = { name: 'root', value: 0, children: [{ name: 'a', value: 60 }, { name: 'b', value: 40 }] }
  withSyncRaf(4, () => {
    tm.setData(root, { animate: false })
    // @ts-expect-error — access private layout for assertion
    const rects = allRects(tm.layout as InspectableLayoutNode[])
    assert.ok(rects.length > 1, 'value:0 root with positive children still produces tiles')
    tm.destroy()
  })
})

// ─── GC-pressure: squarify pre-computed rowValues ────────────────────────────
//
// Bug (ct-gc-pressure): the hot inner loop called row.map(n => n.value) and
// newRow.map(n => n.value) on every iteration — two O(n) array allocs per node.
// Fix: maintain a parallel rowValues array, avoiding the map() calls entirely.
// Regression: layout must produce the same number of finite tiles as before.

test('squarify: rowValues optimization produces correct finite tile count', () => {
  const { ctx } = makeMockCtx()
  const canvas = {
    width: 800, height: 600,
    getContext: () => ctx,
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
  } as unknown as HTMLCanvasElement
  // 30 nodes with varied sizes to exercise multiple row flushes.
  const children: TreemapNode[] = []
  for (let i = 0; i < 30; i++) children.push({ name: `n${i}`, value: Math.pow(2, i % 5 + 1) })
  const root: TreemapNode = { name: 'root', value: children.reduce((s, c) => s + c.value, 0), children }
  const tm = new CushionTreemap<TreemapNode>(canvas, { theme: THEMES[0], animate: false })
  withSyncRaf(4, () => {
    tm.setData(root, { animate: false })
    // @ts-expect-error
    const rects = allRects(tm.layout as InspectableLayoutNode[])
    assert.ok(rects.length > 5, 'multiple tiles produced')
    for (const r of rects) {
      for (const [k, v] of Object.entries({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 })) {
        assert.ok(Number.isFinite(v), `coord ${k}=${v} must be finite after rowValues optimization`)
      }
    }
    tm.destroy()
  })
})

test('constructor throws a descriptive error when getContext returns null', () => {
  const nullCtxCanvas = {
    width: 240, height: 160,
    getContext: () => null,            // simulate WebGL-bound / unavailable 2D
    addEventListener() {}, removeEventListener() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 160 }),
  } as unknown as HTMLCanvasElement

  assert.throws(
    () => new CushionTreemap<TreemapNode>(nullCtxCanvas),
    (err: unknown) => {
      assert.ok(err instanceof Error, 'throws an Error instance')
      assert.match(err.message, /cushion-treemap/i, 'message names the library')
      assert.match(err.message, /2D rendering context/i, 'message explains the failure')
      return true
    },
  )
})
