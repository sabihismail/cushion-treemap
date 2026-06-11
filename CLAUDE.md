# cushion-treemap

Zero-dependency canvas renderer for 3D-shaded treemaps with 7 built-in themes. Extracted from DiskSniffer; consumed from source (not npm) via Vite alias.

## Stack

- TypeScript 5.7, tsup (ESM + CJS + .d.ts), Vite 6 dev server
- Zero production dependencies — all rendering is hand-rolled 2D canvas math
- Tests: tsx + Node test runner

## How to build/run

```bash
npm install
npm run dev          # demo at http://localhost:5173
npm run build        # dist/ (ESM + CJS + types via tsup)
npm run demo:build   # dist-demo/ + offline HTML (vite-plugin-singlefile)
npm test             # unit tests
npm run typecheck    # tsc --noEmit
```

## Key architecture

**Entry:** `src/index.ts` → exports `CushionTreemap<T>`

| File | Purpose |
|------|---------|
| `src/treemap.ts` | Core class: squarified layout, per-pixel cushion shading, mouse interaction |
| `src/themes.ts` | 7 themes (Catppuccin Mocha, Nord, Tokyo Night, Latte, Carbon, Rosé Pine Dawn, Manila) |
| `src/categories.ts` | File extension → category (video/audio/images/code/docs/archives/executables/other) |

**Data flow:**
1. `new CushionTreemap(canvas, tree)` → squarified layout → depth-decaying ridge surface → per-pixel render
2. `resize(w, h)` → sizes canvas; `setTheme()` / `setColorMode()` / `setCushionStyle()` live without relayout
3. Mouse: `onHover`, `onExpand` (lazy load), `onOpenFile`; `drillIn(node)` / `drillOut()` for zoom

## Key patterns

- **Cushion shading:** quadratic height surface `h(x,y) = ax·x² + bx·x + ay·y² + by·y` per van Wijk & van de Wetering 1999
- **Squarified layout:** near-square tiles (Bruls et al. 2000)
- **Color modes:** `'category'` (by extension) or `'folder-file'` (two-tone SpaceSniffer look)
- **Cushion styles:** `'ridge'` (smooth per-pixel) or `'bevel'` (crisp lit/shadowed edges)
- **Luminance-aware labels:** auto-switch text color for readability
- Generic over node type: `CushionTreemap<T extends { name, value, children?, path? }>`

## Integration with DiskSniffer

DiskSniffer consumes from source (not npm). In DiskSniffer's vite.config.ts:
```ts
resolve: { alias: { 'cushion-treemap': path.resolve(__dirname, '../../cushion-treemap/src/index.ts') } }
```
And in tsconfig.json `paths`. Never `npm link` or `file:` — always source alias.

When changing cushion-treemap API, update DiskSniffer's consumer code too.

## API Reference

### `CushionTreemap<T extends TreemapNode>`

| Member | Type | Description |
|--------|------|-------------|
| `new CushionTreemap(canvas, opts?)` | constructor | Attach to a canvas element; optionally pass `TreemapOptions` |
| `setData(root)` | `(root: T) => void` | Load or replace the tree; triggers layout + render |
| `resize(w, h)` | `(w: number, h: number) => void` | Set canvas pixel size; must be called on container resize |
| `drillIn(node)` | `(node: T) => void` | Zoom into a directory node |
| `drillOut()` | `() => void` | Pop one drill level |
| `setTheme(theme)` | `(theme: Theme) => void` | Live theme switch — repaints, no layout recompute |
| `setColorMode(mode)` | `(mode: ColorMode) => void` | `'category'` or `'folder-file'` |
| `setCushionStyle(s)` | `(s: CushionStyle) => void` | `'ridge'` or `'bevel'` |
| `setAccentTags(v)` | `(v: boolean) => void` | Per-type corner tags in `folder-file` mode |
| `onHover` | `((node, x, y) => void) \| null` | Pointer moves over a tile |
| `onExpand` | `((node) => void) \| null` | Single-click on a directory |
| `onOpenFile` | `((path, node) => void) \| null` | Double-click on a file |
| `destroy()` | `() => void` | Remove listeners, cancel RAF |

### Standalone helpers

| Export | Description |
|--------|-------------|
| `getTheme(name)` | Look up a built-in theme by name; returns `Theme \| undefined` |
| `THEMES` | `Theme[]` — all built-in themes |
| `DEFAULT_THEME` | Catppuccin Mocha |
| `resolveSystemThemeName()` | Returns `'Catppuccin Mocha'` (dark) or `'Clean Light'` based on `prefers-color-scheme` |
| `applyThemeVars(theme)` | Projects theme colors onto CSS variables on `<html>` |
| `categoryForName(filename)` | Maps a filename to a `CategoryKey` |
| `fmtBytes(n)` | Formats a byte count to human-readable string |
| `hexToRgb(hex)` | Parse hex color → `[r, g, b]` (0–255) |
| `luminance(r, g, b)` | Relative luminance for WCAG contrast checks |

### Public types

```ts
interface TreemapNode {
  name: string
  value: number
  children?: TreemapNode[]
  path?: string           // passed back via onOpenFile
}

interface TreemapOptions<T> {
  theme?: Theme
  minPx?: number          // skip tiles < this (default 3)
  headerHeight?: number   // dir header strip px (default 20)
  padding?: number        // gap between tiles (default 2)
  fontFamily?: string
  isDir?: (n: T) => boolean
  categoryForNode?: (n: T) => CategoryKey | null
  colorMode?: ColorMode
  cushionStyle?: CushionStyle
  accentTags?: boolean
  animate?: boolean
}

type ColorMode    = 'category' | 'folder-file'
type CushionStyle = 'ridge' | 'bevel'
type CategoryKey  = 'video' | 'audio' | 'images' | 'code' | 'docs' | 'archives' | 'executables' | 'other'
```

## Programmatic Access

Every capability the demo UI exposes is available directly via the class API — no browser required (except for the canvas itself).

### Minimal headless-style usage (e.g. from DiskSniffer backend tests)

```ts
import { CushionTreemap, getTheme } from 'cushion-treemap'

// Create an OffscreenCanvas (Workers / Node with canvas pkg)
const canvas = new OffscreenCanvas(800, 600)
const tm = new CushionTreemap(canvas as unknown as HTMLCanvasElement)
tm.setData({ name: 'root', value: 0, children: [
  { name: 'bigfile.bin', value: 1_000_000 },
] })
tm.resize(800, 600)
```

### Consuming from DiskSniffer source alias (no npm install)

In DiskSniffer's `vite.config.ts`:
```ts
resolve: { alias: { 'cushion-treemap': path.resolve(__dirname, '../../cushion-treemap/src/index.ts') } }
```
Mirror the alias in `tsconfig.json` `paths`. Do NOT use `npm link` or `file:` protocol.

### Theme enumeration (for a UI picker)

```ts
import { THEMES } from 'cushion-treemap'
THEMES.forEach(t => console.log(t.name, t.isDark ? 'dark' : 'light'))
```

## Known Issues

### HIGH — NaN propagation in squarify strip advance (`treemap.ts` ~561)

When `remainingTotal` reaches zero before all nodes are placed (can happen with very large datasets where floating-point rounding drains the running total early), the advance expression `rowSum / remainingTotal` produces `Infinity` or `NaN`, corrupting all subsequent tile coordinates.

**Guard (not yet applied):**
```ts
// treemap.ts ~561, inside the else branch of worstRatio comparison
if (remainingTotal > 0) {
  if (vW >= vH) vx0 += (rowSum / remainingTotal) * vW
  else          vy0 += (rowSum / remainingTotal) * vH
}
```

Symptom: tiles disappear or render at 0,0 for subtrees with many near-zero-value leaves.

### HIGH — `ImageData` out-of-bounds write (`treemap.ts` ~124, ~160)

`px1 = Math.round(x1)` can exceed `canvasWidth` when a tile's right edge is a fraction above a pixel boundary — `Math.round(canvasWidth - 0.4)` still equals `canvasWidth`. The inner loop then writes beyond the `ImageData` buffer, causing a `RangeError` in strict environments and silent corruption in others.

**Fix (not yet applied):**
```ts
// drawCushion ~124 and drawBevel ~158
const px1 = Math.min(canvasWidth, Math.round(x1))
const py1 = Math.min(canvasHeight, Math.round(y1))
```
`canvasWidth`/`canvasHeight` must be threaded into both draw functions from the `render()` call site.

### MEDIUM — `getContext('2d')` non-null assert crash

`const ctx = canvas.getContext('2d')!` throws `TypeError: Cannot read properties of null` when:
- Canvas is already bound to a WebGL context (cannot create a 2d context on the same element)
- Low-memory Safari silently returns `null`

**Mitigation (not yet applied):** add a null check and emit a developer-readable error:
```ts
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('[cushion-treemap] Failed to get 2d context — canvas may already have a WebGL context')
```

## Debug

- `resize()` must be called manually on container resize — no auto-scale
- Tiles disappear if `minPx` too large for viewport
- `folder-file` mode requires `categoryForNode` function; returns `null` → `'other'`
- Custom nodes must have `name` and `value` — missing either silently breaks layout

## Recent Changes

| Date | Change |
|------|--------|
| 2026-06-11 | `setData` now calls `validateRoot()` before layout — guards `name:undefined` (label would render "undefined") and `value:NaN/negative` (clamped to 0). Export `validateRoot` from index. |
| 2026-06-11 | Squarify hot path: replaced `row.map(n => n.value)` + `newRow.map(n => n.value)` with a parallel `rowValues: number[]` array. Eliminates 2 heap allocs per node in the inner layout loop. |
| 2026-06-09 | CLAUDE.md: added API reference, Programmatic Access, Known Issues (3 HIGH bugs), recent changes log |
| 2026-06-09 | Published to npm; version 0.1.0 |
| Prior | Extracted from DiskSniffer; 7 themes; bevel + ridge cushion styles; demo page + offline HTML |
