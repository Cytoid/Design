import { describe, expect, it } from 'vitest'
import {
  bounds,
  createContext,
  drawText,
  renderNote,
  showsTiming,
  TIMED_GRADES,
  timingClips,
  timingOf,
  timingOffset,
  toSVG,
} from '../src'

describe('timing label (FAST / SLOW)', () => {
  it('has every glyph it needs', () => {
    for (const text of ['FAST', 'SLOW']) {
      const node = drawText(text, 40, '#ffffff')
      expect(node.type === 'group' && node.children.length, text).toBe(4)
    }
  })

  it('only GREAT / GOOD / BAD carry a timing label', () => {
    expect(showsTiming('perfect')).toBe(false)
    expect(showsTiming('miss')).toBe(false)
    expect(TIMED_GRADES.every(showsTiming)).toBe(true)
  })

  it('maps the signed error to fast / slow', () => {
    expect(timingOf(-0.08)).toBe('fast')
    expect(timingOf(0.08)).toBe('slow')
  })

  it('clips render mid-way and are gone at the end', () => {
    const ctx = createContext('click')
    for (const grade of TIMED_GRADES) {
      for (const clip of Object.values(timingClips[grade])) {
        expect(bounds(clip.draw(clip.duration * 0.5, ctx)), clip.id).not.toBeNull()
        expect(bounds(clip.draw(clip.duration, ctx)), clip.id).toBeNull()
      }
    }
  })

  it('fast and slow point opposite ways', () => {
    const ctx = createContext('click')
    const f = toSVG(timingClips.great.fast.draw(0.3, ctx))
    const s = toSVG(timingClips.great.slow.draw(0.3, ctx))
    expect(f).not.toBe(s)
  })

  it('is toggled independently of the judgement text', () => {
    const state = { phase: 'clear' as const, grade: 'good' as const, t: 0.25, timing: 'fast' as const }
    const both = toSVG(renderNote('click', state))
    const textOnly = toSVG(renderNote('click', state, undefined, { timing: false }))
    const timingOnly = toSVG(renderNote('click', state, undefined, { judgement: false }))
    const none = toSVG(renderNote('click', state, undefined, { judgement: false, timing: false }))
    expect(both.length).toBeGreaterThan(textOnly.length)
    expect(timingOnly.length).toBeGreaterThan(none.length)
    expect(textOnly).not.toBe(timingOnly)
  })

  it('never shows on PERFECT even if the state carries a timing', () => {
    const p = { phase: 'clear' as const, grade: 'perfect' as const, t: 0.2 }
    expect(toSVG(renderNote('click', { ...p, timing: 'slow' }))).toBe(toSVG(renderNote('click', p)))
  })

  it('stacks under the judgement text, takes the centre without it', () => {
    const ctx = createContext('click')
    expect(timingOffset(ctx, 'centre')).toEqual({ x: 0, y: 0 })
    const stacked = timingOffset(ctx, 'stacked')
    expect(stacked.y).toBeGreaterThan(0)
    // stays inside the clear effect (note radius)
    expect(stacked.y).toBeLessThan(ctx.size / 2)
  })
})
