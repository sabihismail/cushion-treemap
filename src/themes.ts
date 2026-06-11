/**
 * Theme registry for cushion-treemap.
 *
 * A `Theme` is a plain data object: 8 file-category colors, four chrome colors,
 * and cushion-shading parameters. Colors are authored as hex strings (easy to
 * read/edit); the renderer converts them to RGB tuples once via {@link hexToRgb}
 * because the per-pixel cushion shader works on numeric channels, not CSS strings.
 *
 * Palettes reproduce color values from well-known, permissively-licensed color
 * systems (Catppuccin, Nord, Tokyo Night, Rosé Pine, Carbon, Tailwind). Color
 * values are facts and not themselves copyrightable; sources are credited in the
 * README. The "Carbon" theme reproduces IBM Carbon palette values only — not
 * affiliated with or endorsed by IBM ("IBM" is a trademark of IBM Corp.).
 */

export type CategoryKey =
  | 'video' | 'audio' | 'images' | 'code'
  | 'docs' | 'archives' | 'executables' | 'other'

/** All category keys in canonical legend order. */
export const CATEGORY_KEYS: CategoryKey[] = [
  'video', 'audio', 'images', 'code', 'docs', 'archives', 'executables', 'other',
]

export interface CushionParams {
  /** Light direction X (unnormalized). Top-left convention: negative. */
  lightX: number
  /** Light direction Y (unnormalized). Top-left convention: negative. */
  lightY: number
  /** Light height / specular tightness. Higher = softer, flatter shading. */
  lightZ: number
  /** Initial ridge amplitude (puffiness). ~0.5 flat/modern, ~0.9 pronounced. */
  height: number
  /** Ridge height multiplier per depth level. */
  scaleFactor: number
  /** Ambient (floor) brightness 0–1. Raise on dark themes so deep tiles stay legible. */
  ambient: number
}

export interface Theme {
  name: string
  mode: 'light' | 'dark'
  /** One color per file category, in any order (keyed by CategoryKey). */
  categories: Record<CategoryKey, string>
  /**
   * Two-tone fill for directory tiles, used when `colorMode: 'folder-file'`.
   * SpaceSniffer convention: a warm "manila folder" tone. Ignored in the
   * default category color mode.
   */
  folder: string
  /** Two-tone fill for file tiles, used when `colorMode: 'folder-file'`. */
  file: string
  /** Canvas + page background. */
  background: string
  /** Directory header strip / chrome surface. */
  header: string
  /** Default text color for chrome. */
  text: string
  /** Hover border + subtle separators. */
  border: string
  /**
   * Interactive accent — link/highlight color that reads clearly on both
   * `background` and `header`. Used for breadcrumb active links, drop overlays,
   * and any chrome element that needs a theme-appropriate pop of color.
   */
  accent: string
  cushion: CushionParams
}

const TL = { lightX: -1, lightY: -1 } // top-left light, shared by all themes

export const THEMES: Theme[] = [
  {
    name: 'Catppuccin Mocha', mode: 'dark',
    categories: {
      video: '#89b4fa', audio: '#cba6f7', images: '#a6e3a1', code: '#f9e2af',
      docs: '#b4befe', archives: '#fab387', executables: '#f38ba8', other: '#9399b2',
    },
    folder: '#fab387', file: '#89b4fa',
    background: '#1e1e2e', header: '#313244', text: '#cdd6f4', border: '#45475a',
    accent: '#a78bfa',
    cushion: { ...TL, lightZ: 10, height: 0.62, scaleFactor: 0.78, ambient: 0.34 },
  },
  {
    name: 'Clean Light', mode: 'light',
    categories: {
      video: '#2563eb', audio: '#9333ea', images: '#16a34a', code: '#ca8a04',
      docs: '#4f46e5', archives: '#ea580c', executables: '#dc2626', other: '#64748b',
    },
    folder: '#f59e0b', file: '#3b82f6',
    background: '#f8fafc', header: '#e2e8f0', text: '#0f172a', border: '#cbd5e1',
    accent: '#2563eb',
    cushion: { ...TL, lightZ: 12, height: 0.55, scaleFactor: 0.78, ambient: 0.16 },
  },
  {
    name: 'Nord', mode: 'dark',
    categories: {
      video: '#5e81ac', audio: '#b48ead', images: '#a3be8c', code: '#ebcb8b',
      docs: '#81a1c1', archives: '#d08770', executables: '#bf616a', other: '#8fbcbb',
    },
    folder: '#d08770', file: '#81a1c1',
    background: '#2e3440', header: '#3b4252', text: '#eceff4', border: '#4c566a',
    accent: '#88c0d0',
    cushion: { ...TL, lightZ: 11, height: 0.58, scaleFactor: 0.78, ambient: 0.30 },
  },
  {
    name: 'Tokyo Night', mode: 'dark',
    categories: {
      video: '#7aa2f7', audio: '#bb9af7', images: '#9ece6a', code: '#e0af68',
      docs: '#7dcfff', archives: '#ff9e64', executables: '#f7768e', other: '#565f89',
    },
    folder: '#ff9e64', file: '#7aa2f7',
    background: '#1a1b26', header: '#24283b', text: '#c0caf5', border: '#3b4261',
    accent: '#7aa2f7',
    cushion: { ...TL, lightZ: 9, height: 0.66, scaleFactor: 0.76, ambient: 0.32 },
  },
  {
    name: 'Rosé Pine Dawn', mode: 'light',
    categories: {
      video: '#56949f', audio: '#907aa9', images: '#9ccfd8', code: '#f6c177',
      docs: '#c4a7e7', archives: '#ea9d34', executables: '#eb6f92', other: '#9893a5',
    },
    folder: '#ea9d34', file: '#56949f',
    background: '#faf4ed', header: '#f2e9e1', text: '#575279', border: '#dfdad9',
    accent: '#286983',
    cushion: { ...TL, lightZ: 12, height: 0.50, scaleFactor: 0.80, ambient: 0.18 },
  },
  {
    name: 'Carbon', mode: 'dark',
    categories: {
      video: '#4589ff', audio: '#a56eff', images: '#24a148', code: '#d2a106',
      docs: '#8a3ffc', archives: '#ff832b', executables: '#fa4d56', other: '#8d8d8d',
    },
    folder: '#ff832b', file: '#4589ff',
    background: '#161616', header: '#262626', text: '#f4f4f4', border: '#393939',
    accent: '#4589ff',
    cushion: { ...TL, lightZ: 10, height: 0.60, scaleFactor: 0.78, ambient: 0.30 },
  },
  {
    // SpaceSniffer homage: warm manila folders, soft-blue files, parchment ground.
    name: 'Manila', mode: 'light',
    categories: {
      video: '#3f7fc4', audio: '#8e6fc9', images: '#4aa564', code: '#c9a227',
      docs: '#5b8def', archives: '#cf7833', executables: '#cf5a4e', other: '#9a8c73',
    },
    folder: '#d7b27e', file: '#7fb0e6',
    background: '#eceae3', header: '#d8c49a', text: '#3a3326', border: '#b29b73',
    accent: '#3f7fc4',
    cushion: { ...TL, lightZ: 13, height: 0.46, scaleFactor: 0.82, ambient: 0.20 },
  },
]

/** The boot default used when nothing else is specified. */
export const DEFAULT_THEME = THEMES[0]

/** Look up a theme by exact name; `undefined` if not found. */
export function getTheme(name: string): Theme | undefined {
  return THEMES.find(t => t.name === name)
}

/**
 * Resolve a theme name from the OS color-scheme preference.
 * Dark → "Catppuccin Mocha", light → "Clean Light". Falls back to dark when
 * `matchMedia` is unavailable (e.g. server/Node).
 */
export function resolveSystemThemeName(): string {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'Clean Light'
      : 'Catppuccin Mocha'
  }
  return 'Catppuccin Mocha'
}

/** Parse "#rgb" or "#rrggbb" into an [r,g,b] tuple (0–255). */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * WCAG relative luminance (0–1) of an RGB tuple.
 * More accurate than Rec.601 for contrast decisions — correctly identifies
 * warm orange/amber tiles as light-enough for dark text.
 * Threshold for equal contrast with black vs white is ~0.18.
 */
export function luminance(rgb: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
}

/**
 * Project a theme onto CSS custom properties so DOM chrome (toolbars, legends,
 * tooltips) can follow the active theme alongside the canvas. Sets:
 *   --ct-bg --ct-header --ct-text --ct-text-dim --ct-border
 *   --ct-folder --ct-file
 *   --ct-cat-<category> for each of the 8 categories
 * Framework-agnostic: only touches `element.style`.
 */
export function applyThemeVars(theme: Theme, element?: HTMLElement): void {
  const el = element ?? (typeof document !== 'undefined' ? document.documentElement : null)
  if (!el) return
  const s = el.style
  s.setProperty('--ct-bg', theme.background)
  s.setProperty('--ct-header', theme.header)
  s.setProperty('--ct-text', theme.text)
  const [r, g, b] = hexToRgb(theme.text)
  s.setProperty('--ct-text-dim', `rgba(${r},${g},${b},0.55)`)
  s.setProperty('--ct-border', theme.border)
  s.setProperty('--ct-accent', theme.accent)
  s.setProperty('--ct-folder', theme.folder)
  s.setProperty('--ct-file', theme.file)
  for (const k of CATEGORY_KEYS) s.setProperty(`--ct-cat-${k}`, theme.categories[k])
}
