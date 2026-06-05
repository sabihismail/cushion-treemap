/**
 * Interactive demo for cushion-treemap.
 *
 * Features: theme switcher (6 themes + auto), built-in sample datasets,
 * JSON import (file picker + drag-and-drop), breadcrumb drill navigation,
 * hover tooltip, and a "download sample" button.
 *
 * Imports the library straight from ../src — no build step for `npm run dev`.
 */
import {
  CushionTreemap, THEMES, getTheme, applyThemeVars, resolveSystemThemeName,
  CATEGORY_KEYS, fmtBytes, type TreemapNode,
} from '../src/index'

// ─── A node type that carries an explicit dir flag (so generic/numeric data
//     without file extensions still distinguishes containers from leaves) ──────
interface DemoNode extends TreemapNode {
  children?: DemoNode[]
  /** true = container (directory-like). Derived during adaptation. */
  __dir?: boolean
}

const isDir = (n: DemoNode) => n.__dir ?? !!(n.children && n.children.length > 0)

// ─── Sample dataset 1: deterministic synthetic disk (reproducible, no RNG drift)
const EXT_BY_CAT: Record<string, string[]> = {
  video: ['mp4', 'mkv', 'mov'], audio: ['mp3', 'flac', 'wav'],
  images: ['png', 'jpg', 'svg'], code: ['ts', 'rs', 'go', 'css'],
  docs: ['pdf', 'md', 'docx'], archives: ['zip', '7z', 'tar'],
  executables: ['exe', 'dll'], other: ['dat', 'bin'],
}
const CATS = Object.keys(EXT_BY_CAT)

function syntheticDisk(): DemoNode {
  let seed = 1234567
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const pick = <X>(a: X[]) => a[Math.floor(rnd() * a.length)]

  const makeFile = (i: number): DemoNode => {
    const cat = pick(CATS)
    const ext = pick(EXT_BY_CAT[cat])
    const size = Math.floor((0.05 + rnd() * rnd() * 8) * 1e9)
    return { name: `file_${i}.${ext}`, value: Math.max(size, 1), __dir: false }
  }
  const makeDir = (name: string, depth: number, i: number): DemoNode => {
    const fileCount = 3 + Math.floor(rnd() * 8)
    const dirCount = depth < 3 ? Math.floor(rnd() * 4) : 0
    const children: DemoNode[] = []
    for (let f = 0; f < fileCount; f++) children.push(makeFile(i * 100 + f))
    for (let d = 0; d < dirCount; d++) children.push(makeDir(`${name}_${d}`, depth + 1, i * 10 + d))
    const value = children.reduce((s, c) => s + c.value, 0)
    return { name, value: Math.max(value, 1), __dir: true, children }
  }
  const TOP = ['Users', 'Windows', 'Program Files', 'ProgramData', 'Games', 'Media', 'Projects']
  const root: DemoNode = { name: 'C:', __dir: true, value: 0, children: TOP.map((n, i) => makeDir(n, 1, i)) }
  root.value = root.children!.reduce((s, c) => s + c.value, 0)
  return root
}

// ─── Sample dataset 2: a typical node_modules tree (relatable bloat) ──────────
function nodeModules(): DemoNode {
  const pkg = (name: string, mb: number, files: [string, number][] = []): DemoNode => ({
    name, __dir: true, value: 0,
    children: [
      { name: 'package.json', value: 4_000, __dir: false },
      { name: 'index.js', value: mb * 1e6 * 0.6, __dir: false },
      { name: 'README.md', value: 12_000, __dir: false },
      ...files.map(([n, b]) => ({ name: n, value: b, __dir: false })),
    ],
  })
  const fix = (n: DemoNode): DemoNode => {
    if (n.children) { n.children.forEach(fix); n.value = n.children.reduce((s, c) => s + c.value, 0) }
    return n
  }
  return fix({
    name: 'node_modules', __dir: true, value: 0,
    children: [
      pkg('typescript', 22, [['lib/tsc.js', 9e6], ['lib/typescript.js', 8e6]]),
      pkg('@types', 6, [['node/index.d.ts', 2e6]]),
      pkg('react-dom', 6, [['cjs/react-dom.production.min.js', 1.2e6]]),
      pkg('rxjs', 5), pkg('lodash', 4.8), pkg('vite', 9, [['dist/node/chunks/dep.js', 6e6]]),
      pkg('@babel', 11, [['core/lib/index.js', 1e6]]),
      pkg('esbuild', 9, [['bin/esbuild', 8e6]]),
      pkg('eslint', 7), pkg('moment', 4.4, [['locale/_all.js', 3e6]]),
      pkg('date-fns', 6), pkg('chalk', 0.2), pkg('axios', 2.1),
    ],
  })
}

// ─── Sample dataset 3: non-file data — proves the engine is domain-agnostic ───
function solarSystem(): DemoNode {
  // "value" = relative mass (generic hierarchy, no file extensions) — shows the
  // engine works on any weighted tree, not just disk usage.
  const body = (name: string, mass: number, moons: [string, number][] = []): DemoNode =>
    moons.length
      ? { name, __dir: true, value: 0, children: moons.map(([n, m]) => ({ name: n, value: m, __dir: false })) }
      : { name, value: mass, __dir: false }
  const fix = (n: DemoNode): DemoNode => {
    if (n.children?.length) { n.children.forEach(fix); n.value = n.children.reduce((s, c) => s + c.value, 0) }
    else if (!(n.value > 0)) n.value = 1
    return n
  }
  return fix({
    name: 'Solar System', __dir: true, value: 0,
    children: [
      body('Jupiter', 0, [['Ganymede', 148], ['Callisto', 108], ['Io', 89], ['Europa', 48]]),
      body('Saturn', 0, [['Titan', 134], ['Rhea', 2.3], ['Iapetus', 1.8]]),
      body('Earth', 0, [['Moon', 73]]),
      body('Neptune', 0, [['Triton', 21]]),
      body('Mars', 642), body('Venus', 4867), body('Mercury', 330), body('Uranus', 86.81),
    ],
  })
}

const SAMPLES: Record<string, () => DemoNode> = {
  'Synthetic disk (C:)': syntheticDisk,
  'node_modules': nodeModules,
  'Solar System (generic data)': solarSystem,
}

// ─── Import adapter: accept several common JSON shapes ────────────────────────
// Supports:
//   • native    { name, value, children? }
//   • DiskSniffer-ish { name, size_bytes|size|bytes, node_type|is_dir, children }
//   • an array of any of the above (wrapped in a synthetic root)
function adapt(json: unknown): DemoNode {
  if (Array.isArray(json)) {
    const kids = json.map(adaptNode)
    return { name: 'root', __dir: true, children: kids, value: kids.reduce((s, c) => s + c.value, 0) }
  }
  return adaptNode(json)
}

function adaptNode(raw: unknown): DemoNode {
  if (!raw || typeof raw !== 'object') return { name: String(raw ?? 'node'), value: 1, __dir: false }
  const o = raw as Record<string, unknown>
  const name = String(o.name ?? o.path ?? o.label ?? 'node')
  const rawKids = (o.children ?? o.nodes ?? o.items) as unknown
  const kids = Array.isArray(rawKids) ? rawKids.map(adaptNode) : undefined

  const explicitDir =
    o.node_type === 'dir' || o.type === 'dir' || o.is_dir === true || o.isDir === true ||
    (kids !== undefined && kids.length > 0)

  let value = Number(o.value ?? o.size_bytes ?? o.size ?? o.bytes ?? o.weight ?? 0)
  if (kids && kids.length) {
    const sum = kids.reduce((s, c) => s + c.value, 0)
    if (!Number.isFinite(value) || value <= 0) value = sum   // derive container size from children
  }
  if (!Number.isFinite(value) || value <= 0) value = 1

  const node: DemoNode = { name, value, __dir: explicitDir }
  if (kids) node.children = kids
  if (typeof o.path === 'string') node.path = o.path
  return node
}

// ─── Canvas + engine ──────────────────────────────────────────────────────────
const canvas = document.getElementById('cv') as HTMLCanvasElement
const wrap = document.getElementById('wrap') as HTMLDivElement
const tip = document.getElementById('tip') as HTMLDivElement
const statusEl = document.getElementById('status') as HTMLSpanElement
const crumbsEl = document.getElementById('crumbs') as HTMLElement

// Default to the SpaceSniffer look: folder/file two-tone + crisp bevel + Manila theme.
const tm = new CushionTreemap<DemoNode>(canvas, { isDir, colorMode: 'folder-file', cushionStyle: 'bevel' })

let current: DemoNode = syntheticDisk()

tm.onExpand = (n) => { if (n.children?.length) tm.drillIn(n) }
tm.onOpenFile = (path, n) => setStatus(`leaf opened: ${path || n.name}`)
tm.onZoomChange = renderCrumbs
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); tm.drillOut() })

// Hover tooltip — position from the real mouse, content from onHover.
let hovered: DemoNode | null = null
tm.onHover = (n) => { hovered = n; if (!n) tip.style.display = 'none' }
canvas.addEventListener('mousemove', (e) => {
  if (!hovered) { tip.style.display = 'none'; return }
  const total = (tm.getZoomStack().at(-1) ?? current).value
  const pct = total > 0 ? ((hovered.value / total) * 100).toFixed(1) : '?'
  tip.innerHTML = `<div class="n">${escapeHtml(hovered.name)}</div>` +
    `<div class="m">${fmtBytes(hovered.value)} · ${pct}%${isDir(hovered) ? ' · folder' : ''}</div>`
  const r = wrap.getBoundingClientRect()
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14
  if (x + 270 > r.width) x = e.clientX - r.left - 270
  if (y + 70 > r.height) y = e.clientY - r.top - 70
  tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.display = 'block'
})
canvas.addEventListener('mouseleave', () => { tip.style.display = 'none' })

function fit() {
  const r = wrap.getBoundingClientRect()
  tm.resize(r.width - 16, r.height - 16)
}
new ResizeObserver(fit).observe(wrap)

// ─── Load a dataset ────────────────────────────────────────────────────────────
function load(root: DemoNode, label: string) {
  current = root
  tm.setData(root)
  tm.drillOut(0)            // reset zoom + fire onZoomChange (rebuilds breadcrumb)
  fit()
  const leaves = countLeaves(root)
  setStatus(`${label} — ${fmtBytes(root.value)} · ${leaves.toLocaleString()} leaves`)
}

function countLeaves(n: DemoNode): number {
  if (!n.children?.length) return 1
  return n.children.reduce((s, c) => s + countLeaves(c), 0)
}

// ─── Breadcrumb ─────────────────────────────────────────────────────────────
function renderCrumbs() {
  const stack = tm.getZoomStack()
  const parts: { label: string; depth: number }[] = [{ label: current.name, depth: 0 }]
  stack.forEach((n, i) => parts.push({ label: n.name, depth: i + 1 }))
  crumbsEl.innerHTML = ''
  parts.forEach((p, i) => {
    if (i > 0) { const s = document.createElement('span'); s.className = 'sep'; s.textContent = '›'; crumbsEl.appendChild(s) }
    const b = document.createElement('button')
    b.textContent = p.label
    if (i < parts.length - 1) b.onclick = () => tm.drillOut(p.depth)
    crumbsEl.appendChild(b)
  })
}

// ─── Theme picker ──────────────────────────────────────────────────────────────
const themeSel = document.getElementById('theme') as HTMLSelectElement
themeSel.innerHTML = '<option value="auto">Auto (system)</option>' +
  THEMES.map(t => `<option value="${t.name}">${t.name}</option>`).join('')

const legendEl = document.getElementById('legend') as HTMLDivElement
function renderLegend() {
  if (tm.getColorMode() === 'folder-file') {
    const swatch = (v: string, label: string) => `<span><i style="background:var(${v})"></i>${label}</span>`
    let html = swatch('--ct-folder', 'folder') + swatch('--ct-file', 'file')
    if (tm.getAccentTags()) html += `<span class="hint" style="opacity:.55">tags:</span>` +
      CATEGORY_KEYS.map(k => `<span><i style="background:var(--ct-cat-${k})"></i>${k}</span>`).join('')
    legendEl.innerHTML = html
    return
  }
  legendEl.innerHTML = CATEGORY_KEYS.map(k =>
    `<span><i style="background:var(--ct-cat-${k})"></i>${k}</span>`).join('')
}
function setTheme(name: string) {
  const theme = name === 'auto' ? getTheme(resolveSystemThemeName())! : getTheme(name)!
  applyThemeVars(theme)
  tm.setTheme(theme)
  renderLegend()
}
themeSel.addEventListener('change', () => setTheme(themeSel.value))
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', () => { if (themeSel.value === 'auto') setTheme('auto') })

// ─── Render-style controls (color mode · cushion style · accent tags) ─────────
const colorModeSel = document.getElementById('colorMode') as HTMLSelectElement
const cushionSel = document.getElementById('cushionStyle') as HTMLSelectElement
const accentChk = document.getElementById('accent') as HTMLInputElement
colorModeSel.addEventListener('change', () => {
  tm.setColorMode(colorModeSel.value as 'category' | 'folder-file')
  renderLegend()
})
cushionSel.addEventListener('change', () => tm.setCushionStyle(cushionSel.value as 'ridge' | 'bevel'))
accentChk.addEventListener('change', () => { tm.setAccentTags(accentChk.checked); renderLegend() })

// ─── Dataset picker ───────────────────────────────────────────────────────────
const dsSel = document.getElementById('dataset') as HTMLSelectElement
dsSel.innerHTML = Object.keys(SAMPLES).map(k => `<option value="${k}">${k}</option>`).join('')
dsSel.addEventListener('change', () => load(SAMPLES[dsSel.value](), dsSel.value))

// ─── JSON import: file picker ─────────────────────────────────────────────────
const fileInput = document.getElementById('file') as HTMLInputElement
;(document.getElementById('import') as HTMLButtonElement).onclick = () => fileInput.click()
fileInput.onchange = () => { const f = fileInput.files?.[0]; if (f) readFile(f); fileInput.value = '' }

async function readFile(file: File) {
  try {
    const root = adapt(JSON.parse(await file.text()))
    if (!root.children?.length && !root.value) throw new Error('no usable nodes')
    load(root, file.name)
  } catch (e) {
    setStatus(`couldn't import "${file.name}": ${(e as Error).message}`, true)
  }
}

// ─── JSON import: drag-and-drop ───────────────────────────────────────────────
let dragDepth = 0
const onDragEnter = (e: DragEvent) => { e.preventDefault(); dragDepth++; wrap.classList.add('dragging') }
const onDragLeave = (e: DragEvent) => { e.preventDefault(); if (--dragDepth <= 0) wrap.classList.remove('dragging') }
window.addEventListener('dragenter', onDragEnter)
window.addEventListener('dragleave', onDragLeave)
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault(); dragDepth = 0; wrap.classList.remove('dragging')
  const f = e.dataTransfer?.files?.[0]; if (f) readFile(f)
})

// ─── Download the current dataset as JSON ─────────────────────────────────────
;(document.getElementById('sampleDl') as HTMLButtonElement).onclick = () => {
  const clean = (n: DemoNode): unknown => ({
    name: n.name, value: n.value,
    ...(n.children?.length ? { children: n.children.map(clean) } : {}),
  })
  const blob = new Blob([JSON.stringify(clean(current), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${current.name.replace(/[^\w.-]+/g, '_') || 'treemap'}.json`
  a.click(); URL.revokeObjectURL(a.href)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function setStatus(msg: string, isErr = false) { statusEl.textContent = msg; statusEl.classList.toggle('err', isErr) }
function escapeHtml(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)) }

// ─── Boot ──────────────────────────────────────────────────────────────────────
// Reflect the SpaceSniffer defaults in the controls, then apply the Manila theme.
colorModeSel.value = 'folder-file'
cushionSel.value = 'bevel'
themeSel.value = 'Manila'
setTheme('Manila')
load(current, 'Synthetic disk (C:)')
