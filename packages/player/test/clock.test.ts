import { describe, expect, it } from 'vitest'
import { ManualClock } from '../src/clock'

describe('manualClock', () => {
  it('plays from a given time and advances by rate', () => {
    const c = new ManualClock()
    expect(c.playing).toBe(false)
    c.play(5)
    expect(c.playing).toBe(true)
    expect(c.time).toBe(5)
    c.advance(1)
    expect(c.time).toBeCloseTo(6)
    c.rate = 2
    c.advance(1)
    expect(c.time).toBeCloseTo(8)
  })

  it('ignores advance while paused', () => {
    const c = new ManualClock()
    c.play(1)
    c.pause()
    c.advance(10)
    expect(c.time).toBe(1)
    c.play()
    c.advance(0.5)
    expect(c.time).toBeCloseTo(1.5)
  })

  it('seeks while paused via set()', () => {
    const c = new ManualClock()
    c.set(42)
    expect(c.time).toBe(42)
    expect(c.playing).toBe(false)
  })

  it('keeps time continuity across rate changes', () => {
    const c = new ManualClock()
    c.play(0)
    c.advance(1)
    c.rate = 0.5
    c.advance(2)
    expect(c.time).toBeCloseTo(2)
  })
})
