import { describe, expect, it } from 'vitest'
import { slotProgress, slotRegistry } from '../src/skin/slots'

function contract(name: string) {
  const slot = slotRegistry.get(name)
  if (!slot)
    throw new Error(`unknown slot ${name}`)
  return slot
}

describe('slotProgress', () => {
  it('loop wraps the driver around the contract duration', () => {
    const loop = contract('hold:loopUnder')
    expect(loop.mode).toBe('loop')
    expect(slotProgress(loop, 0)).toBe(0)
    expect(slotProgress(loop, 0.25)).toBe(0.25)
    expect(slotProgress(loop, 1)).toBe(0)
    expect(slotProgress(loop, 1.5)).toBe(0.5)
    expect(slotProgress(loop, -0.25)).toBe(0.75)
  })

  it('loop honours a period override', () => {
    const loop = contract('hold:loopUnder')
    expect(slotProgress(loop, 0.3, 0.5)).toBeCloseTo(0.6)
    expect(slotProgress(loop, 0.3, 2)).toBeCloseTo(0.15)
  })

  it('loop freezes on the first frame for a period of 0', () => {
    const loop = contract('hold:loopUnder')
    expect(slotProgress(loop, 0.3, 0)).toBe(0)
    expect(slotProgress(loop, 1e6, 0)).toBe(0)
  })

  it('once divides by the contract duration, ignoring overrides', () => {
    const once = contract('click:clear:perfect')
    expect(once.mode).toBe('once')
    expect(slotProgress(once, 0.21)).toBe(0.5)
    expect(slotProgress(once, 0.42, 1)).toBe(1)
  })

  it('normalized and progress pass the driver through', () => {
    expect(slotProgress(contract('click:enter'), 0.7)).toBe(0.7)
    expect(slotProgress(contract('hold:progress'), 0.4)).toBe(0.4)
  })
})
