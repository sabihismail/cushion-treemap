/**
 * Maps a filename's extension to one of the eight visual categories.
 * Pure data + a single lookup — no DOM, no theme dependency.
 */

import type { CategoryKey } from './themes'

const EXT_CATEGORY: Record<string, CategoryKey> = {}

function register(cat: CategoryKey, exts: string[]) {
  for (const e of exts) EXT_CATEGORY[e] = cat
}

register('video', ['mp4', 'mkv', 'avi', 'mov', 'webm', 'wmv', 'm4v', 'flv', 'mpg', 'mpeg', 'ts', 'm2ts', '3gp'])
register('audio', ['mp3', 'flac', 'wav', 'aac', 'ogg', 'oga', 'm4a', 'wma', 'opus', 'aiff', 'mid'])
register('images', ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp', 'psd', 'heic', 'tiff', 'tif', 'raw', 'ico', 'avif'])
register('code', ['js', 'jsx', 'mjs', 'cjs', 'tsx', 'py', 'rs', 'go', 'cs', 'java', 'kt', 'cpp', 'cc', 'c', 'h', 'hpp',
  'css', 'scss', 'html', 'htm', 'json', 'xml', 'sh', 'ps1', 'bat', 'sql', 'toml', 'yaml', 'yml', 'rb', 'php', 'swift', 'lua', 'vue', 'svelte'])
register('docs', ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'odt', 'csv', 'epub'])
register('archives', ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso', 'cab', 'tgz', 'zst'])
register('executables', ['exe', 'dll', 'msi', 'sys', 'com', 'scr', 'app', 'deb', 'rpm', 'apk', 'bin'])

// Note: ".ts" is intentionally registered as video (MPEG transport stream) above.
// TypeScript source ".ts" collides with this; for disk-usage purposes video TS
// files dominate. Consumers needing TS-as-code can override via categoryForNode.

/** Return the category for a filename, or "other" if the extension is unknown. */
export function categoryForName(name: string): CategoryKey {
  const dot = name.lastIndexOf('.')
  if (dot < 0 || dot === name.length - 1) return 'other'
  return EXT_CATEGORY[name.slice(dot + 1).toLowerCase()] ?? 'other'
}
