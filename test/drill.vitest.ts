/**
 * Task ct-test-drill: drillIn/drillOut public API tests
 */
import { describe, it, expect } from 'vitest'
import { makeCanvas } from './canvas-shim'
import { CushionTreemap, type TreemapNode } from '../src/index'
import { THEMES } from '../src/themes'

function makeTm(width = 400, height = 300) {
  const canvas = makeCanvas(width, height)
  const tm = new CushionTreemap<TreemapNode>(canvas, {
    theme: THEMES[0],
    animate: false,
  })
  return tm
}

const ROOT: TreemapNode = {
  name: 'root', value: 500,
  children: [
    {
      name: 'dir-a', value: 300,
      children: [
        { name: 'file1.txt', value: 150 },
        { name: 'file2.txt', value: 150 },
      ],
    },
    {
      name: 'dir-b', value: 200,
      children: [
        {
          name: 'sub', value: 200,
          children: [{ name: 'deep.bin', value: 200 }],
        },
      ],
    },
    { name: 'lone.txt', value: 0 },
  ],
}

describe('drillIn', () => {
  it('drillIn on a parent node increases zoom stack depth', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.drillIn(ROOT.children![0])
    expect(tm.getZoomStack()).toHaveLength(1)
    tm.destroy()
  })

  it('drillIn renders without throw', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    expect(() => {
      tm.drillIn(ROOT.children![0])
    }).not.toThrow()
    tm.destroy()
  })

  it('drillIn on a leaf (no children) adds to stack but produces empty layout', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    const leaf = ROOT.children![0].children![0] // file1.txt — no children
    tm.drillIn(leaf)
    // Stack grows
    expect(tm.getZoomStack()).toHaveLength(1)
    // Layout should be empty (a leaf has no renderable children)
    // @ts-expect-error private
    expect((tm.layout as unknown[]).length).toBe(0)
    tm.destroy()
  })

  it('multiple drillIn calls build the stack', () => {
    const tm = makeTm(800, 600)
    tm.setData(ROOT, { animate: false })
    tm.drillIn(ROOT.children![1])       // dir-b
    tm.drillIn(ROOT.children![1].children![0]) // sub
    expect(tm.getZoomStack()).toHaveLength(2)
    tm.destroy()
  })

  it('drillIn fires onZoomChange with correct path', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    const changes: string[][] = []
    tm.onZoomChange = (path) => changes.push([...path])
    tm.drillIn(ROOT.children![0]) // dir-a
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual(['dir-a'])
    tm.destroy()
  })
})

describe('drillOut', () => {
  it('drillOut at root level (empty stack) does not throw', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    expect(tm.getZoomStack()).toHaveLength(0)
    expect(() => tm.drillOut()).not.toThrow()
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.destroy()
  })

  it('drillOut after drillIn returns to root', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    tm.drillIn(ROOT.children![0])
    expect(tm.getZoomStack()).toHaveLength(1)
    tm.drillOut()
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.destroy()
  })

  it('drillOut pops one level at a time', () => {
    const tm = makeTm(800, 600)
    tm.setData(ROOT, { animate: false })
    tm.drillIn(ROOT.children![1])
    tm.drillIn(ROOT.children![1].children![0])
    expect(tm.getZoomStack()).toHaveLength(2)
    tm.drillOut()
    expect(tm.getZoomStack()).toHaveLength(1)
    tm.drillOut()
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.destroy()
  })

  it('drillOut(toDepth) pops to exact depth', () => {
    const tm = makeTm(800, 600)
    tm.setData(ROOT, { animate: false })
    tm.drillIn(ROOT.children![1])
    tm.drillIn(ROOT.children![1].children![0])
    expect(tm.getZoomStack()).toHaveLength(2)
    tm.drillOut(0)  // toDepth=0 → clear stack
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.destroy()
  })

  it('drillOut fires onZoomChange', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    tm.drillIn(ROOT.children![0])
    const changes: string[][] = []
    tm.onZoomChange = (path) => changes.push([...path])
    tm.drillOut()
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([])
    tm.destroy()
  })

  it('drillOut after drillIn restores root layout tiles', () => {
    const tm = makeTm(800, 600)
    tm.setData(ROOT, { animate: false })
    // @ts-expect-error private
    const rootTiles = (tm.layout as unknown[]).length
    tm.drillIn(ROOT.children![0])
    tm.drillOut()
    // @ts-expect-error private
    expect((tm.layout as unknown[]).length).toBe(rootTiles)
    tm.destroy()
  })
})

describe('drill stack depth', () => {
  it('getZoomStack length reflects drill operations', () => {
    const tm = makeTm()
    tm.setData(ROOT, { animate: false })
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.drillIn(ROOT.children![0])
    expect(tm.getZoomStack()).toHaveLength(1)
    tm.drillOut()
    expect(tm.getZoomStack()).toHaveLength(0)
    tm.destroy()
  })
})
