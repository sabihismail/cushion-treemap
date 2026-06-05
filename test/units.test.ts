import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  THEMES, DEFAULT_THEME, CATEGORY_KEYS,
  getTheme, resolveSystemThemeName,
  hexToRgb, luminance, categoryForName, fmtBytes,
  type CategoryKey,
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
