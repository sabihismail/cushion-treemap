/**
 * Cushion Treemap — framework-agnostic canvas renderer.
 *
 * Layout:  Squarify (Bruls, Huizing & van Wijk, 2000) — stable, near-square tiles.
 * Shading: van Wijk & van de Wetering cushion algorithm (InfoVis 1999).
 *          Each tile is a quadratic height surface h(x,y) = ax·x² + bx·x + ay·y² + by·y.
 *          Children accumulate the parent's surface, creating visible depth hierarchy.
 *          Per-pixel lighting via Canvas ImageData typed arrays (fast, no setPixel).
 *
 * The class owns the canvas imperatively: zero framework re-renders during
 * interaction. Bring any framework (or none) — pass a canvas, call setData().
 */

import {
  DEFAULT_THEME, hexToRgb, luminance, CATEGORY_KEYS,
  type Theme, type CategoryKey,
} from './themes'
import { categoryForName } from './categories'

// ─── Public node shape ──────────────────────────────────────────────────────

/**
 * The minimal node the renderer needs. Bring your own richer type as the
 * generic `T`; only `name` and `value` are required. A node is treated as a
 * directory when it has children (override via {@link TreemapOptions.isDir}).
 */
export interface TreemapNode {
  name: string
  value: number
  children?: TreemapNode[]
  /** Optional identifier passed to onOpenFile (e.g. a filesystem path). */
  path?: string
}

/**
 * How tiles are colored.
 * - `category`  — files by extension category, dirs by a depth-cycled palette (default).
 * - `folder-file` — SpaceSniffer two-tone: one color for all folders, one for all files.
 */
export type ColorMode = 'category' | 'folder-file'

/**
 * Surface shading style.
 * - `ridge` — smooth per-pixel van Wijk cushion (default).
 * - `bevel` — crisp SpaceSniffer-style flat fill with lit/shadowed edges.
 */
export type CushionStyle = 'ridge' | 'bevel'

export interface TreemapOptions<T extends TreemapNode = TreemapNode> {
  /** Active theme. Defaults to Catppuccin Mocha. */
  theme?: Theme
  /** Skip tiles smaller than this many px (default 3). */
  minPx?: number
  /** Directory header strip height in px (default 20). */
  headerHeight?: number
  /** Gap between tiles in px (default 2). */
  padding?: number
  fontFamily?: string
  /** Decide whether a node is a directory. Default: has ≥1 child. */
  isDir?: (node: T) => boolean
  /** Map a node to a color category. Default: by filename extension. `null` → "other". */
  categoryForNode?: (node: T) => CategoryKey | null
  /** Tile coloring scheme (default `category`). */
  colorMode?: ColorMode
  /** Surface shading style (default `ridge`). */
  cushionStyle?: CushionStyle
  /** In `folder-file` mode, paint a small per-category corner tag on file tiles (default false). */
  accentTags?: boolean
  /** Animate fade-in on data change and the hover glow (default true). */
  animate?: boolean
}

interface GeomOptions {
  minPx: number
  headerHeight: number
  padding: number
  fontFamily: string
}

const GEOM_DEFAULTS: GeomOptions = {
  minPx: 3,
  headerHeight: 20,
  padding: 2,
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
}

// ─── Internal layout node ─────────────────────────────────────────────────────

interface LayoutNode<T extends TreemapNode> {
  x0: number; y0: number; x1: number; y1: number
  node: T
  depth: number
  surface: Float64Array // [ax, ay, bx, by] accumulated from root
  rgb: [number, number, number]
  isDir: boolean
  cat: CategoryKey | null // file category (for accent tags); null for dirs
  children: LayoutNode<T>[]
}

// ─── Pixel-bounds helper ──────────────────────────────────────────────────────

/**
 * Compute the integer pixel span [p0, p1) for a tile edge, clamped to the canvas.
 * `Math.round` can push the far edge one pixel past the buffer (e.g.
 * `round(size - 0.4) === size`), so the upper bound is clamped to `size` and the
 * lower bound to 0. Used by both shading paths to prevent ImageData OOB writes.
 */
export function pixelSpan(lo: number, hi: number, size: number): [number, number] {
  const p0 = Math.max(0, Math.round(lo))
  const p1 = Math.min(size, Math.round(hi))
  return [p0, p1]
}

// ─── Cushion math (van Wijk) ──────────────────────────────────────────────────

/** Accumulate a parabolic ridge onto the cushion surface coefficients. */
function addRidge(s: Float64Array, x0: number, y0: number, x1: number, y1: number, h: number) {
  const w = x1 - x0, ht = y1 - y0
  if (w <= 0 || ht <= 0) return
  s[0] -= 4 * h / w;   s[2] += 4 * h / w * (x0 + x1)
  s[1] -= 4 * h / ht;  s[3] += 4 * h / ht * (y0 + y1)
}

/** Draw one cushion tile into ImageData pixels via per-pixel lighting. */
function drawCushion(
  pixels: Uint8ClampedArray,
  stride: number,
  canvasWidth: number, canvasHeight: number,
  x0: number, y0: number, x1: number, y1: number,
  s: Float64Array,
  rgb: [number, number, number],
  Lx: number, Ly: number, Lz: number,
  Ia: number,
) {
  const Is = 1 - Ia
  const [r, g, b] = rgb
  // Clamp to canvas bounds: Math.round can push the right/bottom edge one pixel
  // past the buffer (e.g. round(W - 0.4) === W), writing into the next row / OOB.
  const [px0, px1] = pixelSpan(x0, x1, canvasWidth)
  const [py0, py1] = pixelSpan(y0, y1, canvasHeight)

  for (let iy = py0; iy < py1; iy++) {
    const base = iy * stride
    const ny_part = 2 * s[1] * (iy + 0.5) + s[3]
    for (let ix = px0; ix < px1; ix++) {
      const nx = -(2 * s[0] * (ix + 0.5) + s[2])
      const ny = -ny_part
      const len = Math.sqrt(nx * nx + ny * ny + 1)
      let cosa = (nx * Lx + ny * Ly + Lz) / len
      if (cosa < 0) cosa = 0
      const pixel = Is * cosa + Ia
      const idx = (base + ix) << 2
      pixels[idx]     = r * pixel
      pixels[idx + 1] = g * pixel
      pixels[idx + 2] = b * pixel
      pixels[idx + 3] = 255
    }
  }
}

/**
 * SpaceSniffer-style bevel: a flat color fill with a lit top/left edge and a
 * shadowed bottom/right edge. Crisp and cheap — no per-pixel normal math.
 * `depth` darkens nested tiles slightly so hierarchy still reads in two-tone mode.
 */
function drawBevel(
  pixels: Uint8ClampedArray, stride: number,
  canvasWidth: number, canvasHeight: number,
  x0: number, y0: number, x1: number, y1: number,
  rgb: [number, number, number], depth: number,
) {
  // Clamp to canvas bounds (see drawCushion): round can overshoot by one pixel.
  const [px0, px1] = pixelSpan(x0, x1, canvasWidth)
  const [py0, py1] = pixelSpan(y0, y1, canvasHeight)
  const dim = Math.max(0.62, 1 - depth * 0.05)
  const r = rgb[0] * dim, g = rgb[1] * dim, b = rgb[2] * dim
  const bw = (px1 - px0) > 6 && (py1 - py0) > 6 ? 2 : 1
  for (let iy = py0; iy < py1; iy++) {
    const base = iy * stride
    const dt = iy - py0, db = py1 - 1 - iy
    for (let ix = px0; ix < px1; ix++) {
      const dl = ix - px0, dr = px1 - 1 - ix
      let f = 1
      if (Math.min(dl, dt, dr, db) < bw) {
        if (dt <= dl && dt <= dr && dt <= db) f = 1.30      // top edge — lit
        else if (dl <= dr && dl <= db) f = 1.16             // left edge — lit
        else if (db <= dr) f = 0.66                         // bottom edge — shadow
        else f = 0.80                                       // right edge — shadow
      }
      const idx = (base + ix) << 2
      pixels[idx]     = Math.min(255, r * f)
      pixels[idx + 1] = Math.min(255, g * f)
      pixels[idx + 2] = Math.min(255, b * f)
      pixels[idx + 3] = 255
    }
  }
}

// ─── Squarify worst-ratio ─────────────────────────────────────────────────────

/**
 * Compute how far the "free" corner advances after a row is flushed in squarify.
 * The free area shrinks by the row's share `rowSum / remainingTotal` along its
 * longer side. If `remainingTotal` has drifted to 0 (or below) via floating-point
 * subtraction on the final row, `rowSum / remainingTotal` would be Infinity/NaN
 * and poison every subsequent tile's coordinates — so we guard and advance by 0.
 * Returned dx/dy are always finite.
 */
export function stripAdvance(
  rowSum: number, remainingTotal: number, vW: number, vH: number,
): { dx: number; dy: number } {
  if (!(remainingTotal > 0)) return { dx: 0, dy: 0 }
  const frac = rowSum / remainingTotal
  if (vW >= vH) return { dx: frac * vW, dy: 0 }
  return { dx: 0, dy: frac * vH }
}

function worstRatio(values: number[], rowSum: number, total: number, W: number, H: number): number {
  if (rowSum <= 0 || total <= 0 || W <= 0 || H <= 0) return Infinity
  const area = W * H
  const rowArea = (rowSum / total) * area
  const shorter = Math.min(W, H)
  const strip = rowArea / shorter
  let worst = 0
  for (const v of values) {
    const nodeLen = (v / rowSum) * shorter
    if (nodeLen <= 0) { worst = Infinity; break }
    const r = Math.max(strip / nodeLen, nodeLen / strip)
    if (r > worst) worst = r
  }
  return worst
}

// ─── Main class ───────────────────────────────────────────────────────────────

export class CushionTreemap<T extends TreemapNode = TreemapNode> {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private geom: GeomOptions
  private isDir: (node: T) => boolean
  private categoryOf: (node: T) => CategoryKey | null

  // theme-derived
  private theme!: Theme
  private catColor!: Record<CategoryKey, [number, number, number]>
  private catTuples!: [number, number, number][]
  private bgRgb!: [number, number, number]
  private rootRgb!: [number, number, number]
  private folderRgb!: [number, number, number]
  private fileRgb!: [number, number, number]
  private glowRgb!: [number, number, number]
  private height = 0.62
  private scaleFactor = 0.78
  private ambient = 0.34
  private Lx = 0; private Ly = 0; private Lz = 1

  // render-style state
  private colorMode: ColorMode
  private cushionStyle: CushionStyle
  private accentTags: boolean
  private animate: boolean

  // animation state
  private appear = 1            // 0→1 fade-in progress on data change
  private appearStart = 0
  private hoverGlow = 0         // 0→1 eased hover highlight intensity
  private animRaf: number | null = null

  // Cached base layer: the expensive per-pixel cushion/bevel field. Rebuilt only
  // when geometry, colors, or shading style change — NOT on hover/fade frames
  // (those are cheap ctx overlays painted on top of this cached ImageData).
  private baseImg: ImageData | null = null
  private baseDirty = true

  private root: T | null = null
  private zoomStack: T[] = []
  private layout: LayoutNode<T>[] = []
  private hovered: LayoutNode<T> | null = null
  private pendingRaf: number | null = null

  onHover?: (node: T | null, x: number, y: number) => void
  /** Single-click on a directory tile. Use for lazy-load / expand-in-place. */
  onExpand?: (node: T) => void
  /** Double-click on a file tile (only fired when node.path is set). */
  onOpenFile?: (path: string, node: T) => void
  /** Fired when the engine's own drill zoom changes (drillIn/drillOut). */
  onZoomChange?: (path: string[]) => void
  /**
   * Right-click on a tile. `node` is the tile under the cursor (null on empty
   * space). When set, the engine suppresses the browser's native context menu so
   * the consumer can render its own. x/y match onHover (canvas-relative).
   */
  onContextMenu?: (node: T | null, x: number, y: number) => void

  constructor(canvas: HTMLCanvasElement, options: TreemapOptions<T> = {}) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      throw new Error(
        'cushion-treemap: failed to get a 2D rendering context from the canvas ' +
        '(it may already be bound to a WebGL context, or 2D is unavailable in this environment)',
      )
    }
    this.ctx = ctx
    this.geom = {
      minPx: options.minPx ?? GEOM_DEFAULTS.minPx,
      headerHeight: options.headerHeight ?? GEOM_DEFAULTS.headerHeight,
      padding: options.padding ?? GEOM_DEFAULTS.padding,
      fontFamily: options.fontFamily ?? GEOM_DEFAULTS.fontFamily,
    }
    this.isDir = options.isDir ?? ((n) => !!(n.children && n.children.length > 0))
    this.categoryOf = options.categoryForNode ?? ((n) => categoryForName(n.name))
    this.colorMode = options.colorMode ?? 'category'
    this.cushionStyle = options.cushionStyle ?? 'ridge'
    this.accentTags = options.accentTags ?? false
    this.animate = options.animate ?? true

    this.applyTheme(options.theme ?? DEFAULT_THEME)

    canvas.addEventListener('mousemove', this.onMouseMove)
    canvas.addEventListener('mouseleave', this.onMouseLeave)
    canvas.addEventListener('click', this.onCanvasClick)
    canvas.addEventListener('dblclick', this.onCanvasDblClick)
    canvas.addEventListener('contextmenu', this.onCanvasContextMenu)
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove)
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave)
    this.canvas.removeEventListener('click', this.onCanvasClick)
    this.canvas.removeEventListener('dblclick', this.onCanvasDblClick)
    this.canvas.removeEventListener('contextmenu', this.onCanvasContextMenu)
    if (this.pendingRaf !== null) cancelAnimationFrame(this.pendingRaf)
    if (this.animRaf !== null) cancelAnimationFrame(this.animRaf)
  }

  /** Swap the active theme. Geometry is unchanged; recolors and repaints. */
  setTheme(theme: Theme) {
    this.applyTheme(theme)
    this.relayout()
    this.scheduleRender()
  }

  getTheme(): Theme { return this.theme }

  /** Switch the tile coloring scheme (`category` ↔ `folder-file`). Recolors + repaints. */
  setColorMode(mode: ColorMode) {
    if (mode === this.colorMode) return
    this.colorMode = mode
    this.relayout()
    this.scheduleRender()
  }
  getColorMode(): ColorMode { return this.colorMode }

  /** Switch the surface shading style (`ridge` ↔ `bevel`). Repaints; no relayout. */
  setCushionStyle(style: CushionStyle) {
    if (style === this.cushionStyle) return
    this.cushionStyle = style
    this.baseDirty = true       // shading style changes the per-pixel base layer
    this.scheduleRender()
  }
  getCushionStyle(): CushionStyle { return this.cushionStyle }

  /** Toggle per-category corner tags on file tiles (only visible in `folder-file` mode). */
  setAccentTags(on: boolean) {
    if (on === this.accentTags) return
    this.accentTags = on
    this.scheduleRender()
  }
  getAccentTags(): boolean { return this.accentTags }

  /** Enable/disable fade-in + hover-glow animation. */
  setAnimate(on: boolean) {
    this.animate = on
    if (!on) { this.appear = 1; this.hoverGlow = this.hovered ? 1 : 0 }
  }

  private applyTheme(theme: Theme) {
    this.theme = theme
    const c = theme.categories
    this.catColor = {
      video: hexToRgb(c.video), audio: hexToRgb(c.audio), images: hexToRgb(c.images),
      code: hexToRgb(c.code), docs: hexToRgb(c.docs), archives: hexToRgb(c.archives),
      executables: hexToRgb(c.executables), other: hexToRgb(c.other),
    }
    this.catTuples = CATEGORY_KEYS.map(k => this.catColor[k])
    this.bgRgb = hexToRgb(theme.background)
    const hdr = hexToRgb(theme.header)
    this.rootRgb = [hdr[0] * 0.72, hdr[1] * 0.72, hdr[2] * 0.72]
    this.folderRgb = hexToRgb(theme.folder)
    this.fileRgb = hexToRgb(theme.file)
    // Hover glow: the theme's most "active" accent (video/blue), kept bright.
    this.glowRgb = hexToRgb(theme.categories.video)

    const cu = theme.cushion
    this.height = cu.height
    this.scaleFactor = cu.scaleFactor
    this.ambient = cu.ambient
    const len = Math.sqrt(cu.lightX * cu.lightX + cu.lightY * cu.lightY + cu.lightZ * cu.lightZ)
    this.Lx = cu.lightX / len; this.Ly = cu.lightY / len; this.Lz = cu.lightZ / len
  }

  /**
   * Replace the dataset and repaint.
   *
   * By default this plays the fade-in (appropriate for first load / drive switch).
   * Pass `{ animate: false }` for incremental updates of the *same* dataset (e.g.
   * a live scan merging batches many times per second) so the canvas doesn't
   * re-fade on every update — which otherwise reads as constant flashing.
   */
  setData(root: T, opts?: { animate?: boolean }) {
    this.root = root
    this.relayout()
    const fade = (opts?.animate ?? true) && this.animate
    if (fade) {
      this.appear = 0
      this.appearStart = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      this.startAnim()
    } else {
      // Finish any in-flight fade and just repaint with the new layout.
      this.appear = 1
      this.scheduleRender()
    }
  }

  drillIn(node: T) {
    this.zoomStack.push(node)
    this.relayout(); this.scheduleRender()
    this.onZoomChange?.(this.zoomStack.map(n => n.name))
  }

  drillOut(toDepth?: number) {
    if (toDepth !== undefined) this.zoomStack = this.zoomStack.slice(0, toDepth)
    else this.zoomStack.pop()
    this.relayout(); this.scheduleRender()
    this.onZoomChange?.(this.zoomStack.map(n => n.name))
  }

  getZoomStack(): T[] { return this.zoomStack }

  resize(w: number, h: number) {
    this.canvas.width = Math.round(w)
    this.canvas.height = Math.round(h)
    this.relayout()
    this.scheduleRender()
  }

  // ─── Color ──────────────────────────────────────────────────────────────────

  private dirColor(depth: number, idx: number): [number, number, number] {
    if (this.colorMode === 'folder-file') {
      // One folder tone for all dirs; nest readability comes from depth dim + bevel.
      const f = Math.max(0.62, 1 - depth * 0.06)
      const [r, g, b] = this.folderRgb
      return [r * f, g * f, b * f]
    }
    const cats = this.catTuples
    const i = ((depth * 3 + idx) % cats.length + cats.length) % cats.length
    const base = cats[i]
    const f = Math.max(0.5, 1 - depth * 0.07)
    return [base[0] * f, base[1] * f, base[2] * f]
  }

  private fileColor(node: T): [number, number, number] {
    if (this.colorMode === 'folder-file') return this.fileRgb
    const cat = this.categoryOf(node) ?? 'other'
    return this.catColor[cat]
  }

  // ─── Layout ───────────────────────────────────────────────────────────────

  private currentNode(): T | null {
    if (!this.root) return null
    return this.zoomStack.length > 0 ? this.zoomStack[this.zoomStack.length - 1] : this.root
  }

  private relayout() {
    this.baseDirty = true       // any geometry/data/theme change invalidates the base layer
    this.layout = []
    const node = this.currentNode()
    if (!node) return

    const W = this.canvas.width, H = this.canvas.height
    if (W < 1 || H < 1) return

    const children = node.children as T[] | undefined
    if (!children || children.length === 0) return

    const sorted = children.filter(c => c.value > 0).sort((a, b) => b.value - a.value)
    const total = sorted.reduce((s, c) => s + c.value, 0)
    if (total <= 0) return

    const rootSurface = new Float64Array(4)
    addRidge(rootSurface, 0, 0, W, H, this.height)

    const rootNode: LayoutNode<T> = {
      x0: 0, y0: 0, x1: W, y1: H,
      node, depth: -1, surface: rootSurface,
      rgb: this.rootRgb, isDir: true, cat: null, children: [],
    }
    this.layout = [rootNode]

    const g = this.geom
    const contentY0 = g.headerHeight
    if (H - contentY0 >= g.minPx && W >= g.minPx * 2) {
      this.squarifyPlace(sorted, 0, contentY0, W, H, total, 0, rootSurface, rootNode.children, { i: 0 })
    }
  }

  private squarifyPlace(
    nodes: T[],
    cx0: number, cy0: number, cx1: number, cy1: number,
    total: number, depth: number,
    parentSurface: Float64Array,
    out: LayoutNode<T>[],
    sibIdx: { i: number },
  ) {
    if (!nodes.length || total <= 0) return
    const g = this.geom

    let row: T[] = []
    let rowSum = 0
    let remainingTotal = total
    let vx0 = cx0, vy0 = cy0

    const flushRow = () => {
      if (!row.length) return
      const vW = cx1 - vx0, vH = cy1 - vy0
      if (vW <= 0 || vH <= 0) return
      const vArea = vW * vH
      const rowArea = (rowSum / remainingTotal) * vArea
      const horizontal = vW >= vH

      let off = horizontal ? vy0 : vx0
      const strip = horizontal ? rowArea / vH : rowArea / vW

      for (let r = 0; r < row.length; r++) {
        const rn = row[r]
        const frac = rn.value / rowSum
        let nx0: number, ny0: number, nx1: number, ny1: number

        if (horizontal) {
          nx0 = vx0;         ny0 = off
          nx1 = vx0 + strip; ny1 = off + frac * vH
          off += frac * vH
        } else {
          nx0 = off;         ny0 = vy0
          nx1 = off + frac * vW; ny1 = vy0 + strip
          off += frac * vW
        }

        const p = g.padding
        const lx0 = nx0 + p, ly0 = ny0 + p, lx1 = nx1 - p, ly1 = ny1 - p
        if (lx1 - lx0 < g.minPx || ly1 - ly0 < g.minPx) continue

        const surf = new Float64Array(parentSurface)
        const h = this.height * Math.pow(this.scaleFactor, depth)
        addRidge(surf, lx0, ly0, lx1, ly1, h)

        const myIdx = sibIdx.i++
        const dir = this.isDir(rn)
        const col = dir ? this.dirColor(depth, myIdx) : this.fileColor(rn)
        const cat = dir ? null : (this.categoryOf(rn) ?? 'other')

        const ln: LayoutNode<T> = {
          x0: lx0, y0: ly0, x1: lx1, y1: ly1,
          node: rn, depth, surface: surf, rgb: col, isDir: dir, cat, children: [],
        }
        out.push(ln)

        const kids = rn.children as T[] | undefined
        if (dir && kids && kids.length > 0) {
          const contentY0 = Math.min(ly0 + g.headerHeight, ly1)
          const childTotal = kids.reduce((s, c) => s + c.value, 0)
          if (childTotal > 0 && ly1 - contentY0 >= g.minPx && lx1 - lx0 >= g.minPx * 2) {
            const childSorted = kids.filter(c => c.value > 0).sort((a, b) => b.value - a.value)
            this.squarifyPlace(childSorted, lx0, contentY0, lx1, ly1, childTotal, depth + 1, surf, ln.children, { i: 0 })
          }
        }
      }
    }

    for (const node of nodes) {
      if (node.value <= 0) continue
      const W = cx1 - vx0, H = cy1 - vy0
      if (W < g.minPx || H < g.minPx) break

      if (row.length === 0) {
        row.push(node); rowSum += node.value
      } else {
        const newRow = [...row, node]
        const newSum = rowSum + node.value
        const curW = worstRatio(row.map(n => n.value), rowSum, remainingTotal, W, H)
        const newW = worstRatio(newRow.map(n => n.value), newSum, remainingTotal, W, H)
        if (newW <= curW) {
          row.push(node); rowSum += node.value
        } else {
          flushRow()
          const vW = cx1 - vx0, vH = cy1 - vy0
          // Guard against floating-point drift draining remainingTotal to 0 on the
          // final row: rowSum / 0 → Infinity/NaN would poison every later tile.
          const adv = stripAdvance(rowSum, remainingTotal, vW, vH)
          vx0 += adv.dx; vy0 += adv.dy
          remainingTotal -= rowSum
          row = [node]; rowSum = node.value
        }
      }
    }
    if (row.length > 0) flushRow()
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  private scheduleRender() {
    if (this.animRaf !== null) return // animation loop already painting
    if (this.pendingRaf !== null) return
    this.pendingRaf = requestAnimationFrame(() => {
      this.pendingRaf = null
      this.render()
    })
  }

  /** Drive fade-in + hover-glow easing until both settle, then stop. */
  private startAnim() {
    if (!this.animate || this.animRaf !== null) return
    const step = () => {
      this.animRaf = null
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now())
      if (this.appear < 1) {
        const t = (now - this.appearStart) / 280
        this.appear = t >= 1 ? 1 : t
      }
      const target = this.hovered ? 1 : 0
      this.hoverGlow += (target - this.hoverGlow) * 0.22
      if (Math.abs(target - this.hoverGlow) < 0.02) this.hoverGlow = target
      this.render()
      if (this.appear < 1 || this.hoverGlow !== target) {
        this.animRaf = requestAnimationFrame(step)
      }
    }
    this.animRaf = requestAnimationFrame(step)
  }

  private render() {
    const { canvas, ctx, geom } = this
    const W = canvas.width, H = canvas.height
    if (W < 1 || H < 1) return

    // Rebuild the per-pixel base layer only when geometry/colors/style changed.
    // Hover-glow and fade-in frames reuse the cached ImageData (they only add
    // cheap ctx overlays on top), so they no longer recompute the cushion field.
    let img = this.baseImg
    if (this.baseDirty || !img || img.width !== W || img.height !== H) {
      img = ctx.createImageData(W, H)
      const pixels = img.data as unknown as Uint8ClampedArray
      const [br, bg, bb] = this.bgRgb
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = br; pixels[i + 1] = bg; pixels[i + 2] = bb; pixels[i + 3] = 255
      }

      const { Lx, Ly, Lz, ambient: Ia } = this
      const bevel = this.cushionStyle === 'bevel'

      const paint = (n: LayoutNode<T>, x0: number, y0: number, x1: number, y1: number) => {
        if (bevel) drawBevel(pixels, W, W, H, x0, y0, x1, y1, n.rgb, Math.max(0, n.depth))
        else drawCushion(pixels, W, W, H, x0, y0, x1, y1, n.surface, n.rgb, Lx, Ly, Lz, Ia)
      }

      const renderNodes = (nodes: LayoutNode<T>[]) => {
        for (const n of nodes) {
          if (n.x1 - n.x0 < geom.minPx || n.y1 - n.y0 < geom.minPx) continue
          // Fill the whole tile (folder body = frame around inset children → fills gaps),
          // then draw children on top so the parent color shows as header + border.
          paint(n, n.x0, n.y0, n.x1, n.y1)
          if (n.children.length > 0) renderNodes(n.children)
        }
      }

      renderNodes(this.layout)
      this.baseImg = img
      this.baseDirty = false
    }

    ctx.putImageData(img, 0, 0)

    // Fade-in: dim toward background by the inverse of the eased appear progress.
    if (this.appear < 1) {
      const eased = 1 - Math.pow(1 - this.appear, 3) // easeOutCubic
      ctx.save()
      ctx.globalAlpha = 1 - eased
      ctx.fillStyle = `rgb(${this.bgRgb[0]},${this.bgRgb[1]},${this.bgRgb[2]})`
      ctx.fillRect(0, 0, W, H)
      ctx.restore()
    }

    if (this.colorMode === 'folder-file' && this.accentTags) this.drawAccents(this.layout)
    this.drawHoverGlow()
    this.drawLabels(this.layout)
  }

  /** Bright eased outline + soft glow on the hovered tile (canvas shadow). */
  private drawHoverGlow() {
    const n = this.hovered
    if (!n || this.hoverGlow <= 0.01) return
    const [r, g, b] = this.glowRgb
    const a = this.hoverGlow
    const ctx = this.ctx
    ctx.save()
    ctx.shadowColor = `rgba(${r},${g},${b},${0.9 * a})`
    ctx.shadowBlur = 14 * a
    ctx.strokeStyle = `rgba(${r},${g},${b},${a})`
    ctx.lineWidth = 2
    ctx.strokeRect(n.x0 + 1, n.y0 + 1, n.x1 - n.x0 - 2, n.y1 - n.y0 - 2)
    ctx.restore()
  }

  /** SpaceSniffer-style per-category corner tag on file tiles (folder-file mode). */
  private drawAccents(nodes: LayoutNode<T>[]) {
    const ctx = this.ctx
    const draw = (nodes: LayoutNode<T>[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { draw(n.children); continue }
        if (n.isDir || !n.cat) continue
        const w = n.x1 - n.x0, h = n.y1 - n.y0
        if (w < 14 || h < 12) continue
        const s = Math.min(11, w * 0.34, h * 0.55)
        const [r, g, b] = this.catColor[n.cat]
        ctx.fillStyle = `rgb(${r},${g},${b})`
        ctx.beginPath()
        ctx.moveTo(n.x1 - s, n.y0)
        ctx.lineTo(n.x1, n.y0)
        ctx.lineTo(n.x1, n.y0 + s)
        ctx.closePath()
        ctx.fill()
      }
    }
    draw(nodes)
  }

  private labelColor(cx: number, cy: number, fallback: [number, number, number]): string {
    // Sample the actual post-shading pixel at the label centre for accurate contrast.
    // Falls back to the base tile colour (e.g. during fade-in or cross-origin canvas).
    let L: number
    if (this.appear >= 1) {
      try {
        const px = this.ctx.getImageData(Math.max(0, Math.round(cx)), Math.max(0, Math.round(cy)), 1, 1).data
        L = luminance([px[0], px[1], px[2]])
      } catch {
        L = luminance(fallback)
      }
    } else {
      L = luminance(fallback)
    }
    // 0.18 is the WCAG equal-contrast crossover point between black and white text.
    return L > 0.18 ? 'rgba(0,0,0,0.82)' : 'rgba(255,255,255,0.92)'
  }

  private drawLabels(nodes: LayoutNode<T>[]) {
    const { ctx, geom } = this
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const draw = (nodes: LayoutNode<T>[]) => {
      for (const n of nodes) {
        const w = n.x1 - n.x0, h = n.y1 - n.y0
        if (w < geom.minPx || h < geom.minPx) continue

        if (n.children.length > 0) {
          const hh = Math.min(geom.headerHeight, h)
          if (w > 30 && hh > 7) {
            const fs = Math.min(11, hh - 5)
            ctx.font = `600 ${fs}px ${geom.fontFamily}`
            ctx.fillStyle = this.labelColor(n.x0 + w / 2, n.y0 + hh / 2, n.rgb)
            ctx.fillText(`${n.node.name}  ${fmtBytes(n.node.value)}`, n.x0 + 4, n.y0 + hh / 2, w - 8)
          }
          draw(n.children)
        } else if (w > 36 && h > 14) {
          const fs = Math.min(10, h * 0.45)
          ctx.font = `${fs}px ${geom.fontFamily}`
          ctx.fillStyle = this.labelColor(n.x0 + w / 2, n.y0 + h / 2, n.rgb)
          const name = n.node.name.length > 22 ? n.node.name.slice(0, 20) + '…' : n.node.name
          ctx.fillText(name, n.x0 + 3, n.y0 + h / 2, w - 6)
        }
      }
    }
    draw(nodes)
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private hitTest(nodes: LayoutNode<T>[], x: number, y: number): LayoutNode<T> | null {
    for (const n of nodes) {
      if (x < n.x0 || x >= n.x1 || y < n.y0 || y >= n.y1) continue
      if (n.children.length > 0) {
        const child = this.hitTest(n.children, x, y)
        if (child) return child
      }
      return n
    }
    return null
  }

  private getXY(e: MouseEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect()
    const sx = this.canvas.width / r.width
    const sy = this.canvas.height / r.height
    return [(e.clientX - r.left) * sx, (e.clientY - r.top) * sy]
  }

  private onMouseMove = (e: MouseEvent) => {
    const [x, y] = this.getXY(e)
    const rawHit = this.hitTest(this.layout, x, y)
    const hit = rawHit?.depth === -1 ? null : rawHit
    if (hit !== this.hovered) {
      this.hovered = hit
      if (this.animate) this.startAnim()
      else this.scheduleRender()
    }
    this.onHover?.(hit?.node ?? null, x, y)
  }

  private onMouseLeave = () => {
    if (this.hovered) {
      this.hovered = null
      if (this.animate) this.startAnim()
      else this.scheduleRender()
    }
    this.onHover?.(null, 0, 0)
  }

  private onCanvasClick = (e: MouseEvent) => {
    const [x, y] = this.getXY(e)
    const hit = this.hitTest(this.layout, x, y)
    if (!hit || hit.depth === -1) return
    if (!hit.isDir) return
    this.onExpand?.(hit.node)
  }

  private onCanvasDblClick = (e: MouseEvent) => {
    const [x, y] = this.getXY(e)
    const hit = this.hitTest(this.layout, x, y)
    if (!hit || hit.depth === -1) return
    if (hit.isDir) return
    if (hit.node.path) this.onOpenFile?.(hit.node.path, hit.node)
  }

  private onCanvasContextMenu = (e: MouseEvent) => {
    if (!this.onContextMenu) return            // no handler → leave native menu intact
    const [x, y] = this.getXY(e)
    const hit = this.hitTest(this.layout, x, y)
    const node = (!hit || hit.depth === -1) ? null : hit.node
    e.preventDefault()                          // suppress browser menu; show ours
    this.onContextMenu(node, x, y)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a byte count as a short human string (TB/GB/MB/KB/B). */
export function fmtBytes(b: number): string {
  if (b >= 1e12) return (b / 1e12).toFixed(1) + ' TB'
  if (b >= 1e9)  return (b / 1e9).toFixed(1)  + ' GB'
  if (b >= 1e6)  return (b / 1e6).toFixed(1)  + ' MB'
  if (b >= 1e3)  return (b / 1e3).toFixed(0)  + ' KB'
  return b + ' B'
}
