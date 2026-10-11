import { describe, expect, it } from 'vitest'
import { layoutBoard, layoutPlayer } from '../src/layout'

describe('layoutPlayer (core setSize formula)', () => {
  it('keeps the full viewport when between 4:3 and 22:9', () => {
    expect(layoutPlayer(1600, 900)).toEqual({ x: 0, y: 0, width: 1600, height: 900 })
  })

  it('letterboxes top/bottom on narrower viewports (4:3 floor)', () => {
    const b = layoutPlayer(600, 600)
    expect(b.width).toBe(600)
    expect(b.height).toBe(450)
    expect(b.y).toBe(75)
    expect(b.x).toBe(0)
  })

  it('letterboxes left/right on wider viewports (22:9 ceiling)', () => {
    const b = layoutPlayer(2400, 800)
    expect(b.height).toBe(800)
    expect(b.width).toBeCloseTo(800 * 22 / 9)
    expect(b.x).toBeCloseTo((2400 - 800 * 22 / 9) / 2)
    expect(b.y).toBe(0)
  })

  it('is exact at both bounds', () => {
    expect(layoutPlayer(1600, 1200)).toEqual({ x: 0, y: 0, width: 1600, height: 1200 })
    expect(layoutPlayer(2200, 900)).toEqual({ x: 0, y: 0, width: 2200, height: 900 })
  })
})

describe('layoutBoard (#player/#note-box inner geometry)', () => {
  it('insets 9% on each side of the player width', () => {
    const b = layoutBoard(1600, 900)
    expect(b.x).toBeCloseTo(144) // 0.09 × 1600
    expect(b.width).toBeCloseTo(1312) // 0.82 × 1600
  })

  it('sits low: top margin 0.0966666×W > bottom margin 0.07×W', () => {
    const b = layoutBoard(1600, 900)
    expect(b.y).toBeCloseTo(1600 * 0.0966666)
    // bottom margin = player height − (y + height)
    const bottom = 900 - (b.y + b.height)
    expect(bottom).toBeCloseTo(1600 * 0.07)
    expect(b.y).toBeGreaterThan(bottom)
  })

  it('composes with the letterbox on narrow viewports', () => {
    const p = layoutPlayer(600, 600) // 600×450 player
    const b = layoutBoard(600, 600)
    expect(b.x).toBeCloseTo(p.x + 600 * 0.09)
    expect(b.y).toBeCloseTo(p.y + 600 * 0.0966666)
    expect(b.height).toBeCloseTo(450 - 600 * (0.0966666 + 0.07))
  })

  it('composes with the letterbox on ultra-wide viewports', () => {
    const p = layoutPlayer(2400, 800)
    const b = layoutBoard(2400, 800)
    expect(b.x).toBeCloseTo(p.x + p.width * 0.09)
    expect(b.y).toBeCloseTo(p.y + p.width * 0.0966666)
    const bottom = 800 - (b.y + b.height)
    expect(bottom).toBeCloseTo(p.width * 0.07)
  })
})
