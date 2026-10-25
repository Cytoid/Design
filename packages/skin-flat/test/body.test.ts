import type { SceneNode } from '@cytoid/notes'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bake, rasterize } from '@cytoid/design-tools'
import { compileSkin, parseSkin } from '@cytoid/notes'
import { createContext, createPalette, designs, flat, flatSkin, holdBody, longHoldBody } from '@cytoid/skin-flat'
import { describe, expect, it, vi } from 'vitest'
import { holdBody as referenceHold, longHoldBody as referenceLong } from './golden/reference/bodies'

const palette = createPalette({ families: { 'hold': { up: '#fe3060', down: '#3070fe' }, 'long-hold': { up: '#10c070', down: '#de70a0' } }, ring: '#f0e0d0' })

describe('parametric body slots', () => {
  for (const direction of ['up', 'down'] as const) {
    for (const scale of [0.5, 1, 2]) {
      it(`reproduces Hold bodies at ${direction}, scale ${scale}`, () => {
        const ctx = createContext('hold', { direction, bodyDirection: direction, scale, palette })
        for (const [length, progress, appear, t] of [
          [0, 0, 1, 0],
          [150, 0, 0, 0],
          [150, 0, 0.15, 0],
          [150, 0.1, 0.25, 0.07],
          [150, 0.45, 1, 0.19],
          [150, 1, 1, 0.5],
          [23.7, 0.999, 1, 0.51],
        ] as const) {
          const options = { length: length * scale, progress, appear, t }
          expect(png(holdBody(options, ctx))).toEqual(png(referenceHold(options, ctx)))
        }
      })

      it(`reproduces Long Hold bodies at ${direction}, scale ${scale}`, () => {
        const ctx = createContext('long-hold', { direction, scale, palette })
        for (const [top, bottom, progress, appear, t, holdDuration] of [
          [0, 0, 0, 1, 0, undefined],
          [150, 70, 0, 0, 0, undefined],
          [150, 70, 0.3, 0.18, 0.4, undefined],
          [0, 100, 0.5, 1, 1, undefined],
          [150, 0, 0.9, 1, 1.8, undefined],
          [150, 70, 1, 1, 2, undefined],
          [150, 70, 0.5, 1, 0.1, 0.2],
          [150, 70, 0.9, 1, 3.7, 4],
          [150, 70, 0.2, 1, 4, 4],
          [150, 70, 0.2, 1, 5, 4],
        ] as const) {
          const options = { top: top * scale, bottom: bottom * scale, progress, appear, t, holdDuration }
          expect(png(longHoldBody(options, ctx))).toEqual(png(referenceLong(options, ctx)))
        }
      })
    }
  }

  it('uses custom body slots in wrappers and baked strips', async () => {
    const skin = parseSkin(flatSkin)
    skin.frames.customBody = { type: 'rect', x: -4, y: 0, w: 8, h: 0, fill: '#ff0000' }
    skin.animations.customBody = { layers: [{ source: { frame: 'customBody' }, properties: { h: { input: 'length' } } }] }
    skin.slots['hold:body'] = { animation: 'customBody' }
    const selected = compileSkin(skin)
    const ctx = createContext('hold', { bodyDirection: 'down' })
    expect(holdBody({ length: 123, progress: 0.2 }, ctx, selected)).toMatchObject({ children: [{ fill: '#ff0000', h: 123 }] })
    const holdDraw = vi.spyOn(selected.hold.body!, 'draw')
    const longDraw = vi.spyOn(selected['long-hold'].body!, 'draw')
    const dir = await mkdtemp(join(tmpdir(), 'cytoid-body-'))
    try {
      const manifest = await bake({ appearance: flat, skin: selected, outDir: dir, kinds: [], directions: ['up'], fps: 1, progressFrames: 2, scale: 0.25, frames: false })
      expect(holdDraw).toHaveBeenCalled()
      expect(longDraw).toHaveBeenCalled()
      const entry = manifest.bodies.up!['hold:hold-track']!
      const context = flat.createContext('hold', { scale: 0.25, bodyDirection: 'down' })
      const period = flat.holdDashPeriod(context)
      const expected = flat.holdBody({ length: period * 4, progress: 0, appear: 0.999 }, context, selected)
      expect(await readFile(join(dir, entry.file))).toEqual(rasterize(expected, entry.width, entry.height, entry.width / 2, 0))
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('requires both body slots and applies whole-kind fallback', () => {
    const skin = parseSkin(flatSkin)
    delete skin.slots['hold:body']
    expect(() => compileSkin(skin)).toThrow(/hold: missing required slots: body/)
    expect(compileSkin(skin, designs).hold).toBe(designs.hold)
  })

  it('rejects body inputs in note slots, including indirect animation references', () => {
    const skin = parseSkin(flatSkin)
    skin.slots['hold:enter'] = skin.slots['hold:body']!
    expect(() => compileSkin(skin)).toThrow(/not available/)
    skin.slots['hold:enter'] = flatSkin.slots['hold:enter']!
    skin.slots['long-hold:body'] = skin.slots['hold:body']!
    expect(() => compileSkin(skin)).toThrow(/length.*not available/)
  })

  it('rejects incorrect geometry and nonfinite body parameters', () => {
    const ctx = createContext('hold')
    expect(() => designs.hold.body!.draw({ top: 1, bottom: 2, progress: 0 }, ctx)).toThrow(/geometry/)
    for (const options of [{ length: Infinity, progress: 0 }, { length: 100, progress: Number.NaN }, { length: 100, progress: 0, t: Infinity }])
      expect(() => holdBody(options, ctx)).toThrow(/finite/)
    expect(() => longHoldBody({ top: 100, bottom: 50, progress: 0.5, holdDuration: Infinity }, ctx)).toThrow(/finite/)
  })

  it('keeps body geometry direction separate from color direction', () => {
    const ctx = createContext('hold', { direction: 'down', bodyDirection: 'up', palette })
    expect(png(holdBody({ length: 100, progress: 0.3 }, ctx))).toEqual(png(referenceHold({ length: 100, progress: 0.3 }, ctx)))
  })
})

function png(node: SceneNode) {
  return rasterize(node, 240, 720, 120, 360)
}
