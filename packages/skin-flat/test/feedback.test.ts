import type { Clip, SceneNode } from '@cytoid/notes'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bake, createCylheimTargets, rasterize } from '@cytoid/design-tools'
import { compileSkin, GRADES, loadSkinResources, parseSkin, renderFeedback, TIMED_GRADES, TIMINGS } from '@cytoid/notes'
import { createContext, createPalette, designs, flat, flatSkin, renderNote } from '@cytoid/skin-flat'
import { describe, expect, it } from 'vitest'
import { judgementClips, judgementOffset } from './golden/reference/feedback-judgement'
import { renderTiming } from './golden/reference/feedback-timing'

const png = (node: SceneNode) => rasterize(node, 320, 160, 160, 80)
const palettes = [undefined, createPalette({ grades: { perfect: '#fe7050', great: '#34ccab', good: '#2070fe', bad: '#db50ca', miss: '#958080' } })]

describe('three skin feedback modes', () => {
  for (const grade of GRADES) {
    it(`${grade}: preserves the judgement-only Flat drawing`, () => {
      for (const scale of [0.5, 1, 2]) {
        for (const palette of palettes) {
          const ctx = createContext('hold', { scale, palette })
          for (const u of [0, 0.03, 0.1, 0.2, 0.4, 0.6, 0.8, 1]) {
            const t = judgementClips[grade].duration * u
            const expected: SceneNode = { type: 'group', transform: judgementOffset(ctx), children: [judgementClips[grade].draw(t, ctx)] }
            expect(png(designs.feedback.judgement[grade].draw(t, ctx)).equals(png(expected)), `${grade} scale=${scale} u=${u}`).toBe(true)
          }
        }
      }
    })
  }
  for (const grade of TIMED_GRADES) {
    for (const timing of TIMINGS) {
      it(`${grade}/${timing}: preserves timing-only and combined layouts`, () => {
        const ctx = createContext('click')
        for (const u of [0, 0.03, 0.1, 0.2, 0.4, 0.6, 0.8, 1]) {
          const t = judgementClips[grade].duration * u
          const judge = judgementClips[grade].draw(t, ctx)
          const alone = renderTiming(timing, grade, t, ctx, 'centre')
          const combined: SceneNode = { type: 'group', children: [judge, renderTiming(timing, grade, t, ctx, 'stacked')] }
          expect(png(designs.feedback.timing[grade][timing].draw(t, ctx)).equals(png(alone)), `timing ${u}`).toBe(true)
          expect(png(designs.feedback.combined[grade][timing].draw(t, ctx)).equals(png(combined)), `combined ${u}`).toBe(true)
        }
      })
    }
  }

  it('selects exactly one mode, including absent timing, PERFECT, MISS and both disabled', () => {
    const skin = { ...designs, feedback: structuredFeedback() }
    const ctx = createContext('click')
    expect(renderFeedback('great', 'fast', 0.2, ctx, skin)).toMatchObject({ r: 3 })
    expect(renderFeedback('great', 'slow', 0.2, ctx, skin, { judgement: false })).toMatchObject({ r: 2 })
    expect(renderFeedback('great', 'fast', 0.2, ctx, skin, { timing: false })).toMatchObject({ r: 1 })
    expect(renderFeedback('great', undefined, 0.2, ctx, skin)).toMatchObject({ r: 1 })
    expect(renderFeedback('perfect', 'fast', 0.2, ctx, skin)).toMatchObject({ r: 1 })
    expect(renderFeedback('miss', 'slow', 0.2, ctx, skin, { judgement: false })).toBeNull()
    expect(renderFeedback('great', 'fast', 0.2, ctx, skin, { judgement: false, timing: false })).toBeNull()
    const result = renderNote('hold', { phase: 'clear', grade: 'great', timing: 'fast', t: 0.2 }, createContext('hold'), { skin })
    expect(result).toMatchObject({ children: [expect.anything(), { r: 3 }] })
  })

  it('renders image sequences in a combined slot and bakes the selected feedback modes', async () => {
    const document = parseSkin(flatSkin)
    const src = `data:image/png;base64,${(await readFile(new URL('../../notes/test/fixtures/red.png', import.meta.url))).toString('base64')}`
    document.frames.marker = { type: 'image', src, x: -3, y: -2, w: 6, h: 4 }
    document.animations.marker = { type: 'sequence', frames: ['marker'] }
    document.slots['feedback:combined:great:fast'] = { animation: 'marker' }
    document.slots['feedback:judgement:perfect'] = { animation: 'marker' }
    const loaded = await loadSkinResources(document)
    const selected = compileSkin(loaded)
    const ctx = createContext('click')
    const root = await mkdtemp(join(tmpdir(), 'skin-feedback-'))
    try {
      const actual = renderFeedback('great', 'fast', 0.2, ctx, selected)!
      expect(png(actual)).toEqual(png({ type: 'rect', x: -3, y: -2, w: 6, h: 4, fill: '#ff0000' }))
      const target = createCylheimTargets({ ...flat, designs: selected }).find(target => target.pattern.startsWith('PERFECT_'))!
      expect(png(target.draw(0.2, ctx))).toEqual(png(actual))
      const manifest = await bake({ appearance: flat, skin: selected, outDir: root, kinds: [], directions: [], fps: 1, frames: false, progressFrames: 2 })
      expect(manifest.format).toBe('cytoid-notes/frames@2')
      const entry = manifest.feedback.combined.great!.fast
      const expected = rasterize({ type: 'group', children: [actual, { type: 'group', transform: { x: entry.width }, children: [actual] }] }, entry.width * 2, entry.height, entry.width / 2, entry.height / 2)
      expect(await readFile(join(root, entry.sheet.file))).toEqual(expected)
    }
    finally {
      loaded.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('validates feedback slots and falls back by whole mode', () => {
    const skin = parseSkin(flatSkin)
    delete skin.slots['feedback:combined:great:fast']
    expect(() => compileSkin(skin)).toThrow(/feedback:combined.*missing required/)
    expect(compileSkin(skin, designs).feedback.combined).toBe(designs.feedback.combined)
    skin.slots['feedback:timing:perfect:fast'] = { animation: flatSkin.slots['feedback:judgement:perfect']!.animation }
    expect(() => compileSkin(skin, designs)).toThrow(/unknown slot/)
  })
})

function structuredFeedback() {
  const clip = (r: number): Clip => ({ id: 'marker', mode: 'once', duration: 1, draw: (): SceneNode => ({ type: 'circle', r }) })
  return {
    judgement: Object.fromEntries(GRADES.map(g => [g, clip(1)])) as typeof designs.feedback.judgement,
    timing: Object.fromEntries(TIMED_GRADES.map(g => [g, { fast: clip(2), slow: clip(2) }])) as typeof designs.feedback.timing,
    combined: Object.fromEntries(TIMED_GRADES.map(g => [g, { fast: clip(3), slow: clip(3) }])) as typeof designs.feedback.combined,
  }
}
