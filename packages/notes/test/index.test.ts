import { describe, expect, it } from 'vitest'
import {
  bounds,
  clipsOf,
  createContext,
  createPalette,
  designs,
  FAMILIES,
  frameIndex,
  GRADES,
  hexToOklch,
  judgementClips,
  NOTE_KINDS,
  oklch,
  renderNote,
  sampleTimes,
  SHADES,
  tone,
  toSVG,
} from '../src'
import { clickSize } from '../src/notes/click'
import { dragChildSize, dragHeadSize } from '../src/notes/drag'

describe('color', () => {
  it('round-trips hex through oklch', () => {
    const { l, c, h } = hexToOklch('#35A7FF')
    expect(oklch(l, c, h).toLowerCase()).toBe('#35a7ff')
  })
  it('shade scale: 400 is the input colour, darkens monotonically, tone() hits the steps', () => {
    const pal = createPalette()
    for (const fam of FAMILIES) {
      const p = pal.family(fam, 'up')
      expect(hexToOklch(p[400]).h, fam).toBeCloseTo(p.hue, 0)
      const ls = SHADES.map(s => hexToOklch(p[s]).l)
      for (let i = 1; i < ls.length; i++)
        expect(ls[i]!, `${fam} ${SHADES[i]}`).toBeLessThan(ls[i - 1]!)
      for (const s of SHADES)
        expect(tone(p, s)).toBe(p[s])
    }
    const p = pal.family('click', 'up')
    expect(tone(p, 0)).toBe(p[50])
    expect(tone(p, 1000)).toBe(p[950])
    const ls = Array.from({ length: 17 }, (_, i) => hexToOklch(tone(p, 400 + i * 25)).l)
    for (let i = 1; i < ls.length; i++)
      expect(ls[i]!).toBeLessThan(ls[i - 1]!)
  })
  it('palette honours hue overrides and raw hex', () => {
    const p = createPalette({ families: { click: { up: 140, down: '#FF0000' } } })
    expect(p.family('click', 'up').hue).toBeCloseTo(140, 0)
    expect(p.family('click', 'down')[400].toLowerCase()).toBe('#ff0000')
  })
})

describe('designs', () => {
  for (const kind of NOTE_KINDS) {
    it(`${kind}: every clip renders finite geometry`, () => {
      const ctx = createContext(kind)
      for (const clip of clipsOf(designs[kind])) {
        for (const x of sampleTimes(clip, 30)) {
          const node = clip.draw(x, ctx)
          const svg = toSVG(node)
          expect(svg).not.toMatch(/NaN|Infinity/)
          const b = bounds(node)
          if (b)
            expect(b.every(Number.isFinite)).toBe(true)
        }
      }
    })
  }

  it('enter ends at a stable, fully visible pose', () => {
    for (const kind of NOTE_KINDS) {
      const b = bounds(renderNote(kind, { phase: 'enter', p: 1 }))
      expect(b, kind).not.toBeNull()
    }
  })

  it('clear effects fade out completely', () => {
    for (const kind of NOTE_KINDS) {
      const d = designs[kind]
      const ctx = createContext(kind)
      for (const clip of [...Object.values(d.clear), d.miss])
        expect(bounds(clip.draw(clip.duration, ctx)), `${kind}/${clip.id}`).toBeNull()
    }
  })

  it('drop notes are static images', () => {
    for (const kind of ['drop-click', 'drop-drag'] as const) {
      const clip = designs[kind].enter
      const ctx = createContext(kind)
      expect(clip.mode).toBe('static')
      expect(sampleTimes(clip, 30)).toHaveLength(1)
      expect(toSVG(clip.draw(0, ctx))).toBe(toSVG(clip.draw(1, ctx)))
    }
  })

  it('fitted size curves: growing mid-approach, peak above the hit pose, exact landing', () => {
    // click & flick peak at p 0.878 (+12 %), drag family at p 0.766 (+11 % / +6 %)
    const peaks = [
      ['click', 0.878],
      ['flick', 0.878],
      ['click-drag-head', 0.878],
      ['drag-head', 0.766],
      ['drag-child', 0.766],
      ['click-drag-child', 0.766],
    ] as const
    for (const [kind, peak] of peaks) {
      const ctx = createContext(kind)
      const draw = designs[kind].enter.draw
      // growing mid-approach (body; flick excluded — its far-out chevrons dominate the bounds)
      if (kind !== 'flick')
        expect(bounds(draw(0.25, ctx))![2], kind).toBeLessThan(bounds(draw(1, ctx))![2])
      const big = bounds(draw(peak, ctx))!
      const hit = bounds(draw(1, ctx))!
      expect(big[0], kind).toBeLessThan(hit[0])
      expect(big[2], kind).toBeGreaterThan(hit[2])
    }
    // settled on the exact hit-pose size before p = 1 (click/flick from 0.976, drag from 0.87);
    // the click's approach ring/blink still run until p = 1, so assert on the curve there
    expect(clickSize(0.98)).toBe(1)
    expect(clickSize(1)).toBe(1)
    const drag = createContext('drag-head')
    expect(toSVG(designs['drag-head'].enter.draw(0.9, drag))).toBe(toSVG(designs['drag-head'].enter.draw(1, drag)))
  })

  it('size curves: one smooth sweep up, one settle — no wobble, exact landing', () => {
    const curves = [
      ['click', clickSize, 0.878, 1.06],
      ['flick', clickSize, 0.878, 1.06],
      ['drag-head', dragHeadSize, 0.766, 1.05],
      ['drag-child', dragChildSize, 0.766, 1.03],
    ] as const
    for (const [name, size, peakP, peak] of curves) {
      let prev = 0
      for (let p = 0; p <= peakP; p += 0.005) {
        const v = size(p)
        expect(v, `${name} rising at p=${p.toFixed(3)}`).toBeGreaterThanOrEqual(prev - 1e-9)
        prev = v
      }
      expect(size(peakP), `${name} peak`).toBeCloseTo(peak, 6)
      prev = size(peakP)
      for (let p = peakP; p <= 1; p += 0.005) {
        const v = size(p)
        expect(v, `${name} settling at p=${p.toFixed(3)}`).toBeLessThanOrEqual(prev + 1e-9)
        prev = v
      }
      expect(size(1), `${name} hit pose`).toBe(1)
    }
  })

  it('next-page notes read dimmer than notes about to be hit', () => {
    for (const kind of ['click', 'hold', 'drag-head', 'drag-child'] as const) {
      const ctx = createContext(kind)
      const asleep = toSVG(designs[kind].enter.draw(0.3, ctx))
      expect(asleep, kind).not.toContain(ctx.palette[400])
    }
  })

  it('judgement text renders for every grade and fades out', () => {
    const ctx = createContext('click')
    for (const grade of GRADES) {
      const clip = judgementClips[grade]
      expect(bounds(clip.draw(clip.duration * 0.5, ctx)), grade).not.toBeNull()
      expect(bounds(clip.draw(clip.duration, ctx)), grade).toBeNull()
    }
    const withText = toSVG(renderNote('click', { phase: 'clear', grade: 'perfect', t: 0.2 }))
    const without = toSVG(renderNote('click', { phase: 'clear', grade: 'perfect', t: 0.2 }, undefined, { judgement: false }))
    expect(withText.length).toBeGreaterThan(without.length)
  })

  it('hold loop is seamless', () => {
    const clip = designs.hold.hold!.loop
    const ctx = createContext('hold')
    expect(toSVG(clip.draw(0, ctx))).toBe(toSVG(clip.draw(clip.duration, ctx)))
  })
})

describe('sampling', () => {
  it('normalized frames: last frame is the hit pose and index inverts sampling', () => {
    const clip = designs.click.enter
    const xs = sampleTimes(clip, 30)
    expect(xs.at(-1)).toBe(1)
    xs.forEach((x, i) => expect(frameIndex(clip, xs.length, x - 1e-9, 30)).toBe(i))
  })
})
