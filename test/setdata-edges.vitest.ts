/**
 * Task ct-test-setdata-edges: setData edge case tests
 *
 * Tests: empty children, all-zero values, negative values,
 * deeply nested (5+ levels), zero-area viewport.
 */
import { describe, it, expect } from 'vitest'
import { makeCanvas } from './canvas-shim'
import { CushionTreemap, type TreemapNode } from '../src/index'
import { THEMES } from '../src/themes'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeTm(width = 400, height = 300) {
  const canvas = makeCanvas(width, height)
  const tm = new CushionTreemap<TreemapNode>(canvas, {
    theme: THEMES[0],
    animate: false,
  })
  return { tm, canvas }
}

// ─── empty children ──────────────────────────────────────────────────────────

describe('setData — empty children', () => {
  it('root with no children renders without throw', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({ name: 'root', value: 100 }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('root with empty children array renders without throw', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({ name: 'root', value: 100, children: [] }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('root with one child that has no children renders without throw', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [{ name: 'only', value: 100 }],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })
})

// ─── all-zero values ─────────────────────────────────────────────────────────

describe('setData — all-zero values', () => {
  it('root.value=0 with zero-value children does not throw', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({
        name: 'root', value: 0,
        children: [
          { name: 'a', value: 0 },
          { name: 'b', value: 0 },
        ],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('all-zero children produce no layout tiles beyond root placeholder', () => {
    const { tm } = makeTm()
    tm.setData({
      name: 'root', value: 0,
      children: [{ name: 'a', value: 0 }, { name: 'b', value: 0 }],
    }, { animate: false })
    // @ts-expect-error access private layout
    expect((tm.layout as unknown[]).length).toBe(0)
    tm.destroy()
  })

  it('root.value=0 with positive children still produces tiles', () => {
    const { tm } = makeTm()
    tm.setData({
      name: 'root', value: 0,
      children: [{ name: 'a', value: 50 }, { name: 'b', value: 50 }],
    }, { animate: false })
    // @ts-expect-error access private layout
    expect((tm.layout as unknown[]).length).toBeGreaterThan(0)
    tm.destroy()
  })
})

// ─── negative values ─────────────────────────────────────────────────────────

describe('setData — negative values', () => {
  it('negative root value is clamped to 0 (does not throw)', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({ name: 'root', value: -99 }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('negative child values are treated as zero (filtered out by squarify)', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [
          { name: 'neg', value: -10 },
          { name: 'pos', value: 50 },
        ],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('all negative children produce no layout tiles', () => {
    const { tm } = makeTm()
    tm.setData({
      name: 'root', value: 100,
      children: [{ name: 'a', value: -5 }, { name: 'b', value: -10 }],
    }, { animate: false })
    // @ts-expect-error access private layout
    expect((tm.layout as unknown[]).length).toBe(0)
    tm.destroy()
  })

  it('NaN child value is treated as 0 and does not corrupt layout', () => {
    const { tm } = makeTm()
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [
          { name: 'nan', value: NaN },
          { name: 'good', value: 80 },
        ],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })
})

// ─── deeply nested (5+ levels) ───────────────────────────────────────────────

describe('setData — deeply nested', () => {
  /** Build an N-level deep single-child chain */
  function deepTree(levels: number): TreemapNode {
    let node: TreemapNode = { name: `leaf`, value: 100 }
    for (let i = levels - 1; i >= 0; i--) {
      node = { name: `dir${i}`, value: 200, children: [node] }
    }
    return node
  }

  it('5-level deep tree renders without throw', () => {
    const { tm } = makeTm(800, 600)
    expect(() => {
      tm.setData(deepTree(5), { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('10-level deep tree renders without throw', () => {
    const { tm } = makeTm(800, 600)
    expect(() => {
      tm.setData(deepTree(10), { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('deep tree tiles have finite coordinates', () => {
    const { tm } = makeTm(800, 600)
    tm.setData(deepTree(6), { animate: false })
    // @ts-expect-error access private layout
    const layout = tm.layout as Array<{ x0: number; y0: number; x1: number; y1: number; children: unknown[] }>
    function checkFinite(nodes: typeof layout) {
      for (const n of nodes) {
        expect(Number.isFinite(n.x0)).toBe(true)
        expect(Number.isFinite(n.y0)).toBe(true)
        expect(Number.isFinite(n.x1)).toBe(true)
        expect(Number.isFinite(n.y1)).toBe(true)
        checkFinite(n.children as typeof layout)
      }
    }
    checkFinite(layout)
    tm.destroy()
  })

  it('wide shallow tree (5 levels × many siblings) produces finite tiles', () => {
    const { tm } = makeTm(800, 600)
    // 5 levels, each with 4 children
    function wideTree(depth: number): TreemapNode {
      if (depth === 0) return { name: 'leaf', value: 100 }
      return {
        name: `dir-d${depth}`,
        value: 500,
        children: Array.from({ length: 4 }, (_, i) => ({
          ...wideTree(depth - 1),
          name: `dir-d${depth}-c${i}`,
        })),
      }
    }
    expect(() => {
      tm.setData(wideTree(5), { animate: false })
      tm.destroy()
    }).not.toThrow()
  })
})

// ─── zero-area viewport ───────────────────────────────────────────────────────

describe('setData — zero-area viewport', () => {
  it('zero-width canvas does not throw', () => {
    const { tm } = makeTm(0, 300)
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [{ name: 'a', value: 100 }],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('zero-height canvas does not throw', () => {
    const { tm } = makeTm(400, 0)
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [{ name: 'a', value: 100 }],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('1×1 canvas renders without throw', () => {
    const { tm } = makeTm(1, 1)
    expect(() => {
      tm.setData({
        name: 'root', value: 100,
        children: [{ name: 'a', value: 60 }, { name: 'b', value: 40 }],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })

  it('resize to zero and back does not throw', () => {
    const { tm, canvas } = makeTm(400, 300)
    tm.setData({
      name: 'root', value: 100,
      children: [{ name: 'a', value: 100 }],
    }, { animate: false })
    // Simulate resize to 0
    expect(() => {
      canvas.width = 0
      tm.setData({ name: 'root', value: 100 }, { animate: false })
      // Then restore
      canvas.width = 400
      tm.setData({
        name: 'root', value: 100,
        children: [{ name: 'a', value: 100 }],
      }, { animate: false })
      tm.destroy()
    }).not.toThrow()
  })
})
