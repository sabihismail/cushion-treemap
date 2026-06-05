/**
 * cushion-treemap — a zero-dependency, framework-agnostic cushion treemap
 * for HTML canvas, with a built-in switchable theme system.
 *
 * @packageDocumentation
 */

export { CushionTreemap, fmtBytes } from './treemap'
export type { TreemapNode, TreemapOptions, ColorMode, CushionStyle } from './treemap'

export {
  THEMES, DEFAULT_THEME, CATEGORY_KEYS,
  getTheme, resolveSystemThemeName, applyThemeVars,
  hexToRgb, luminance,
} from './themes'
export type { Theme, CushionParams, CategoryKey } from './themes'

export { categoryForName } from './categories'
