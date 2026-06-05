/**
 * Standalone demo: synthetic file tree + theme switcher.
 * Imports the library directly from ../src — no build step needed for `npm run dev`.
 */
import {
  CushionTreemap, THEMES, getTheme, applyThemeVars, resolveSystemThemeName,
  CATEGORY_KEYS, type TreemapNode,
} from '../src/index'

// ── Build a deterministic synthetic tree (no Math.random — reproducible) ──────
const EXT_BY_CAT: Record<string, string[]> = {
  video: ['mp4', 'mkv', 'mov'], audio: ['mp3', 'flac', 'wav'],
  images: ['png', 'jpg', 'svg'], code: ['ts', 'rs', 'go', 'css'],
  docs: ['pdf', 'md', 'docx'], archives: ['zip', '7z', 'tar'],
  executables: ['exe', 'dll'], other: ['dat', 'bin'],
}
const CATS = Object.keys(EXT_BY_CAT)

interface Node extends TreemapNode { kind: 'dir' | 'file'; children?: Node[] }

let seed = 1234567
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = <X>(a: X[]) => a[Math.floor(rnd() * a.length)]

function makeFile(i: number): Node {
  const cat = pick(CATS)
  const ext = pick(EXT_BY_CAT[cat])
  const size = Math.floor((0.05 + rnd() * rnd() * 8) * 1e9)
  return { name: `file_${i}.${ext}`, value: Math.max(size, 1), kind: 'file' }
}

function makeDir(name: string, depth: number, i: number): Node {
  const fileCount = 3 + Math.floor(rnd() * 8)
  const dirCount = depth < 3 ? Math.floor(rnd() * 4) : 0
  const children: Node[] = []
  for (let f = 0; f < fileCount; f++) children.push(makeFile(i * 100 + f))
  for (let d = 0; d < dirCount; d++) children.push(makeDir(`${name}_${d}`, depth + 1, i * 10 + d))
  const value = children.reduce((s, c) => s + c.value, 0)
  return { name, value: Math.max(value, 1), kind: 'dir', children }
}

const TOP = ['Users', 'Windows', 'Program Files', 'ProgramData', 'Games', 'Media', 'Projects']
const root: Node = {
  name: 'C:', kind: 'dir',
  children: TOP.map((n, i) => makeDir(n, 1, i)),
  value: 0,
}
root.children!.forEach(c => { root.value += c.value })

// ── Canvas + engine ──────────────────────────────────────────────────────────
const canvas = document.getElementById('cv') as HTMLCanvasElement
const wrap = document.getElementById('wrap') as HTMLDivElement

const tm = new CushionTreemap<Node>(canvas, {
  isDir: (n) => n.kind === 'dir',
})
tm.onExpand = (n) => { if (n.children?.length) tm.drillIn(n) }
tm.onOpenFile = (path) => alert(`open file: ${path}`)
canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); tm.drillOut() })

function fit() {
  const r = wrap.getBoundingClientRect()
  tm.resize(r.width - 16, r.height - 16)
}
new ResizeObserver(fit).observe(wrap)

// ── Theme picker ──────────────────────────────────────────────────────────────
const sel = document.getElementById('theme') as HTMLSelectElement
sel.innerHTML = '<option value="auto">Auto (system)</option>' +
  THEMES.map(t => `<option value="${t.name}">${t.name}</option>`).join('')

const legendEl = document.getElementById('legend') as HTMLDivElement
function renderLegend() {
  legendEl.innerHTML = CATEGORY_KEYS.map(k =>
    `<span><i style="background:var(--ct-cat-${k})"></i>${k}</span>`).join('')
}

function setTheme(name: string) {
  const theme = name === 'auto' ? getTheme(resolveSystemThemeName())! : getTheme(name)!
  applyThemeVars(theme)
  tm.setTheme(theme)
  renderLegend()
}
sel.addEventListener('change', () => setTheme(sel.value))

setTheme('auto')
tm.setData(root)
fit()
