/**
 * Task ct-test-themes-smoke: smoke tests for all 7 themes × 2 cushion styles
 *
 * Verifies each combination renders without crash and produces visible pixels.
 */
import { describe, it, expect } from 'vitest'
import { makeCanvas } from './canvas-shim'
import { CushionTreemap, type TreemapNode, type CushionStyle } from '../src/index'
import { THEMES } from '../src/themes'

const SAMPLE: TreemapNode = {
  name: 'root', value: 0,
  children: [
    {
      name: 'src', value: 300,
      children: [
        { name: 'main.ts', value: 120 },
        { name: 'utils.ts', value: 80 },
        { name: 'style.css', value: 100 },
      ],
    },
    { name: 'readme.md', value: 40 },
    { name: 'package.json', value: 20 },
    { name: 'video.mp4', value: 500 },
  ],
}

const CUSHION_STYLES: CushionStyle[] = ['ridge', 'bevel']

/**
 * Check canvas has at least one non-black pixel — confirms the renderer actually
 * painted something (not just a blank frame).
 */
function hasNonBlackPixel(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0) return true
  }
  return false
}

describe('themes × cushion styles smoke tests', () => {
  for (const theme of THEMES) {
    for (const style of CUSHION_STYLES) {
      const label = `${theme.name} × ${style}`

      it(`renders without crash: ${label}`, () => {
        const canvas = makeCanvas(400, 300)
        const tm = new CushionTreemap<TreemapNode>(canvas, {
          theme,
          cushionStyle: style,
          animate: false,
        })
        expect(() => {
          tm.setData(SAMPLE, { animate: false })
        }).not.toThrow()
        tm.destroy()
      })

      it(`produces visible pixels: ${label}`, () => {
        const canvas = makeCanvas(400, 300)
        const tm = new CushionTreemap<TreemapNode>(canvas, {
          theme,
          cushionStyle: style,
          animate: false,
        })
        tm.setData(SAMPLE, { animate: false })
        expect(hasNonBlackPixel(canvas)).toBe(true)
        tm.destroy()
      })
    }
  }
})

describe('setTheme switchover smoke', () => {
  it('switching theme mid-session does not throw', () => {
    const canvas = makeCanvas(400, 300)
    const tm = new CushionTreemap<TreemapNode>(canvas, {
      theme: THEMES[0],
      animate: false,
    })
    tm.setData(SAMPLE, { animate: false })
    expect(() => {
      for (const t of THEMES) {
        tm.setTheme(t)
      }
    }).not.toThrow()
    tm.destroy()
  })

  it('switching cushion style mid-session does not throw', () => {
    const canvas = makeCanvas(400, 300)
    const tm = new CushionTreemap<TreemapNode>(canvas, { animate: false })
    tm.setData(SAMPLE, { animate: false })
    expect(() => {
      tm.setCushionStyle('bevel')
      tm.setCushionStyle('ridge')
      tm.setCushionStyle('bevel')
    }).not.toThrow()
    tm.destroy()
  })
})
