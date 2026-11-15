import { bake } from '@cytoid/design-tools'
import { compileSkin, parseSkin } from '@cytoid/notes'
import { chainLink, createContext, designs, flat, flatSkin } from '@cytoid/skin-flat'
import { describe, expect, it, vi } from 'vitest'

describe('chain-link slots', () => {
  it('ships the Cytoid chain verbatim: 0.16 world tile, 50 % duty, gap at the source', () => {
    for (const kind of ['drag-head', 'click-drag-head'] as const) {
      const ctx = createContext(kind)
      const template = chainLink({ length: 300, t: 0 }, ctx)
      expect(template).toBeTruthy()
      const line = (template as { children: { type: string, y1: number, y2: number, strokeWidth: number, dash: number[], dashOffset: number, cap: string }[] }).children[0]!
      // the full 0..length span, one butt-capped dashed line
      expect(line.type).toBe('line')
      expect(line.y1).toBe(0)
      expect(line.y2).toBe(300)
      expect(line.cap).toBe('butt')
      // Cytoid DragLine.png: 16 px @ 100 ppu = 0.16 world; click = 1.9717 world → width 0.0811, dash = gap = half
      expect(line.strokeWidth).toBeCloseTo(128 * 0.0811, 3)
      expect(line.dash[0]).toBeCloseTo(line.strokeWidth / 2, 6)
      expect(line.dash[1]).toBeCloseTo(line.strokeWidth / 2, 6)
      // dashOffset = one dash: the pivot half of the original tile is transparent, so the gap meets the source
      expect(line.dashOffset).toBeCloseTo(line.dash[0], 6)
    }
  })

  it('keeps the template pose across the loop clock (frozen Cytoid pattern)', () => {
    const ctx = createContext('drag-head')
    expect(chainLink({ length: 200, t: 0 }, ctx)).toEqual(chainLink({ length: 200, t: 1e6 }, ctx))
  })

  it('scales with the context unit', () => {
    const half = chainLink({ length: 100, t: 0 }, createContext('drag-head', { scale: 0.5 }))
    const line = (half as { children: { strokeWidth: number }[] }).children[0]!
    expect(line.strokeWidth).toBeCloseTo(64 * 0.0811, 3)
  })

  it('requires the slot on both chain kinds and applies whole-kind fallback', () => {
    const skin = parseSkin(flatSkin)
    delete skin.slots['drag-head:chainLink']
    expect(() => compileSkin(skin)).toThrow(/drag-head: missing required slots: chainLink/)
    expect(compileSkin(skin, designs)['drag-head']).toBe(designs['drag-head'])
    const other = parseSkin(flatSkin)
    delete other.slots['click-drag-head:chainLink']
    expect(() => compileSkin(other)).toThrow(/click-drag-head: missing required slots: chainLink/)
  })

  it('rejects engine-private window inputs but accepts the length / elapsed contract', () => {
    const skin = parseSkin(flatSkin)
    const real = skin.slots['drag-head:chainLink']!
    const frame = (skin.animations[real.animation] as { layers: { source: { frame: string } }[] }).layers[0]!.source.frame
    skin.animations.bad = {
      type: 'layers',
      tracks: { lead: { driver: { input: 'bodyWidth' }, keys: [{ at: 0, value: 0 }, { at: 1, value: 1 }] } },
      layers: [{ source: { frame }, properties: { y2: { track: 'lead' } } }],
    }
    skin.slots['drag-head:chainLink'] = { animation: 'bad' }
    expect(() => compileSkin(skin)).toThrow(/not available/)
  })

  it('bakes chain-link strips from the selected skin', async () => {
    const selected = compileSkin(parseSkin(flatSkin))
    const draw = vi.spyOn(selected['drag-head'].chainLink!, 'draw')
    const dir = await import('node:fs/promises').then(fs => fs.mkdtemp('cytoid-chain-'))
    try {
      const manifest = await bake({ appearance: flat, skin: selected, outDir: dir, kinds: [], directions: ['up'], fps: 1, progressFrames: 2, scale: 0.25, frames: false })
      expect(draw).toHaveBeenCalled()
      const entry = manifest.bodies.up!['drag:chain-link']!
      expect(entry.repeat).toBe('y')
      const clickEntry = manifest.bodies.up!['click-drag:chain-link']!
      expect(clickEntry.repeat).toBe('y')
    }
    finally {
      await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }))
    }
  })
})
