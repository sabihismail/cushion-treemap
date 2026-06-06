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

## Debug

- `resize()` must be called manually on container resize — no auto-scale
- Tiles disappear if `minPx` too large for viewport
- `folder-file` mode requires `categoryForNode` function; returns `null` → `'other'`
- Custom nodes must have `name` and `value` — missing either silently breaks layout
