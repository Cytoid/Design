import type { DrawContext, SceneNode, Skin } from '../src'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { bounds, compileAnimation, compileSkin, derivePalette, drawScene, frameIndex, loadSkinResources, NOTE_KINDS, parseSkin, sampleTimes, toSVG } from '../src'
import { feedbackBindings } from '../src/skin/slots'

const colors = derivePalette(200, { chroma: 0.165 })
const grades = { perfect: '#fff', great: '#fff', good: '#fff', bad: '#fff', miss: '#fff' }
const ctx: DrawContext = {
  kind: 'click',
  palette: colors,
  colors: { note: () => colors, family: () => colors, grade: grades, ring: '#fff' },
  grades,
  direction: 'up',
  bodyDirection: 'up',
  heading: 0,
  approach: 2,
  unit: 128,
  size: 128,
  ringStroke: 10,
  hairStroke: 2,
}
function fragment(): Skin {
  return {
    schemaVersion: 2,
    id: 'sequence',
    name: 'Sequence',
    frames: { a: { type: 'circle', r: 1 }, b: { type: 'circle', r: 2 }, c: { type: 'circle', r: 3 }, d: { type: 'circle', r: 4 } },
    animations: { sequence: { type: 'sequence', fps: 2, frames: ['a', 'b', 'c', 'd'] } },
    slots: {},
  }
}
function radius(node: SceneNode): number | undefined {
  if (node.type === 'circle')
    return node.r
  if (node.type === 'group') {
    for (const child of node.children) {
      const value = radius(child)
      if (value !== undefined)
        return value
    }
  }
}
function complete(skin: Skin): Skin {
  for (const kind of NOTE_KINDS) {
    for (const path of ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad']) skin.slots[`${kind}:${path}`] = { animation: 'sequence' }
  }
  skin.slots['hold:body'] = { animation: 'sequence' }
  skin.slots['long-hold:body'] = { animation: 'sequence' }
  for (const binding of feedbackBindings) skin.slots[binding.name] = { animation: 'sequence' }
  return skin
}

describe('fps sequences', () => {
  it('samples elapsed seconds, with arbitrary frame counts and a held final frame', () => {
    const draw = compileAnimation(fragment(), 'sequence')
    for (const [elapsed, expected] of [[0, 1], [0.499, 1], [0.5, 2], [1, 3], [1.5, 4], [3, 4]])
      expect(radius(draw(elapsed! / 4, ctx, { elapsed: elapsed!, duration: 4 }))).toBe(expected)
  })

  it('fits an fps-less enter sequence to any approach duration', () => {
    const skin = fragment()
    skin.animations.sequence = { type: 'sequence', frames: ['a', 'b', 'c', 'd'] }
    const enter = compileSkin(complete(skin)).click.enter
    for (const approach of [0.3, 1.2, 4]) {
      for (const [p, expected] of [[0, 1], [0.249, 1], [0.25, 2], [0.5, 3], [0.75, 4], [1, 4]])
        expect(radius(enter.draw(p!, { ...ctx, approach }))).toBe(expected)
    }
    const samples = sampleTimes(enter, 30)
    expect(samples[0]).toBe(0)
    expect(samples.at(-1)).toBe(1)
    expect(radius(enter.draw(samples[0]!, ctx))).toBe(1)
    expect(frameIndex(enter, samples.length, 0, 30)).toBe(0)
  })

  it('fits adaptive sequences to a nested window and honors explicit reverse samples', () => {
    const skin = fragment()
    skin.animations.sequence = { type: 'sequence', frames: ['a', 'b', 'c', 'd'] }
    skin.animations.parent = { type: 'layers', layers: [{ at: 0.2, until: 0.6, source: { animation: 'sequence' } }] }
    const draw = compileAnimation(skin, 'parent')
    expect(radius(draw(0.2, ctx))).toBe(1)
    expect(radius(draw(0.4, ctx))).toBe(3)
    expect(radius(draw(0.59, ctx))).toBe(4)
    expect(draw(0.6, ctx)).toMatchObject({ children: [] })
    skin.animations.reverse = { type: 'layers', layers: [{ source: { animation: 'sequence', sample: { from: 1, to: 0 } } }] }
    expect(radius(compileAnimation(skin, 'reverse')(0, ctx))).toBe(4)
    expect(radius(compileAnimation(skin, 'reverse')(1, ctx))).toBe(1)
  })

  it('uses actual approach seconds and fixed once-slot seconds without stretching', () => {
    const d = compileSkin(complete(fragment()))
    expect(radius(d.click.enter.draw(0.5, ctx))).toBe(3) // 1 sec into a 2 sec approach
    expect(radius(d.click.enter.draw(0.5, { ...ctx, approach: 1 }))).toBe(2)
    expect(radius(d.click.clear.perfect.draw(0.3, ctx))).toBe(1) // 0.3 sec, not 71% of the sequence
    expect(radius(d.click.clear.perfect.draw(0.43, ctx))).toBeUndefined()
  })

  it('holds a short sequence until its parent window ends, and permits a transparent last frame', () => {
    const skin = fragment()
    skin.frames.clear = { type: 'group', children: [] }
    skin.animations.sequence = { type: 'sequence', fps: 10, frames: ['a', 'clear'] }
    skin.animations.parent = { type: 'layers', layers: [{ at: 0.2, until: 0.8, source: { animation: 'sequence' } }] }
    const draw = compileAnimation(skin, 'parent')
    expect(radius(draw(0.2, ctx))).toBe(1)
    expect(radius(draw(0.7, ctx))).toBeUndefined()
    expect(draw(0.8, ctx)).toMatchObject({ children: [] })
    skin.animations.sequence.frames = ['a', 'b']
    expect(radius(compileAnimation(skin, 'parent')(0.7, ctx))).toBe(2)
  })

  it('cuts a long sequence at the window end without jumping to its final frame', () => {
    const skin = fragment()
    skin.animations.parent = { type: 'layers', layers: [{ at: 0.1, until: 0.4, source: { animation: 'sequence' } }] }
    const draw = compileAnimation(skin, 'parent')
    expect(radius(draw(0.399, ctx))).toBe(1)
    expect(draw(0.4, ctx)).toMatchObject({ children: [] })
  })

  it('propagates seconds through nested trimmed compositions and supports explicit reverse sampling', () => {
    const skin = fragment()
    skin.animations.inner = { type: 'layers', layers: [{ source: { animation: 'sequence' } }] }
    skin.animations.outer = { type: 'layers', layers: [{ at: 0.25, until: 0.75, source: { animation: 'inner' } }] }
    expect(radius(compileAnimation(skin, 'outer')(0.5, ctx, { elapsed: 2, duration: 4 }))).toBe(3)
    skin.animations.reverse = { type: 'layers', layers: [{ source: { animation: 'sequence', sample: { from: 1, to: 0 } } }] }
    const draw = compileAnimation(skin, 'reverse')
    expect(radius(draw(0, ctx))).toBe(4)
    expect(radius(draw(0.5, ctx))).toBe(3)
    expect(radius(draw(1, ctx))).toBe(1)
    expect(radius(draw(0, ctx))).toBe(4)
  })

  it('mixes sequences with vector layers and animated instance opacity, transforms and additive blending', () => {
    const skin = fragment()
    skin.animations.mixed = {
      type: 'layers',
      tracks: { fade: { ease: { type: 'linear' } } },
      layers: [{ source: { frame: 'a' } }, { source: { animation: 'sequence' }, blend: 'add', properties: { opacity: { track: 'fade' }, transform: { scale: 2 } } }],
    }
    expect(compileAnimation(skin, 'mixed')(0.75, ctx)).toMatchObject({ children: [
      { type: 'circle', r: 1 },
      { type: 'group', blend: 'add', children: [{ opacity: 0.75, isolate: true, transform: { scale: 2 }, children: [{ children: [{ r: 2 }] }] }] },
    ] })
  })

  it.each([0, -1, Infinity, Number.NaN])('rejects invalid fps %s', (fps) => {
    const skin = fragment()
    Object.assign(skin.animations.sequence!, { fps })
    expect(() => compileAnimation(skin, 'sequence')).toThrow()
  })

  it('rejects empty sequences, unknown frames and ambiguous animation definitions', () => {
    for (const patch of [{ frames: [] }, { frames: ['missing'] }, { layers: [] }, { type: 'unknown' }]) {
      const skin = fragment()
      Object.assign(skin.animations.sequence!, patch)
      expect(() => compileAnimation(skin, 'sequence')).toThrow()
    }
  })
})

const png = () => readFile(new URL('./fixtures/red.png', import.meta.url))
function imageSkin(src = 'assets/red.png'): Skin {
  const skin = fragment()
  skin.frames.a = { type: 'image', src, x: -5, y: -6, w: 10, h: 12, opacity: 0.5 }
  skin.frames.nested = { type: 'group', children: [skin.frames.a] }
  skin.animations.sequence = { type: 'sequence', fps: 10, frames: ['nested'] }
  for (const binding of feedbackBindings) skin.slots[binding.name] = { animation: 'sequence' }
  return skin
}
function imageNode(node: SceneNode): Extract<SceneNode, { type: 'image' }> {
  if (node.type === 'image')
    return node
  if (node.type === 'group')
    return imageNode(node.children[0]!)
  throw new Error('no image')
}

describe('prepared PNG frames', () => {
  it('resolves each relative source once, decodes before drawing, and embeds PNGs in SVG', async () => {
    const resolve = vi.fn(png)
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap
    const decode = vi.fn(async () => bitmap)
    const loaded = await loadSkinResources(imageSkin(), { resolve, decode })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith('assets/red.png')
    const draw = compileAnimation(loaded, 'sequence')
    const node = draw(0.2, ctx)
    expect(bounds(node)).toEqual([-5, -6, 5, 6])
    expect(toSVG(node)).toContain('<image href="data:image/png;base64,')
    expect(toSVG(node)).toContain('opacity="0.5"')
    const canvas = { drawImage: vi.fn() } as unknown as CanvasRenderingContext2D
    drawScene(canvas, imageNode(node))
    expect(canvas.drawImage).toHaveBeenCalledWith(bitmap, -5, -6, 10, 12)
    draw(0.8, ctx)
    expect(decode).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledTimes(1)
    loaded.dispose()
    loaded.dispose()
    expect(bitmap.close).toHaveBeenCalledTimes(1)
    expect(() => draw(0.2, ctx)).toThrow(/disposed/)
  })

  it('loads embedded PNGs without a resolver', async () => {
    const src = `data:image/png;base64,${(await png()).toString('base64')}`
    const loaded = await loadSkinResources(imageSkin(src))
    const image = imageNode(compileAnimation(loaded, 'sequence')(0, ctx)).image
    expect(image.width).toBe(1)
    expect(image.height).toBe(1)
    expect(image.src).toBe(src)
    loaded.dispose()
  })

  it('fails early for unloaded resources and malformed PNG data', async () => {
    expect(() => compileAnimation(imageSkin(), 'sequence')).toThrow(/loadSkinResources/)
    await expect(loadSkinResources(imageSkin())).rejects.toThrow(/resolver/)
    await expect(loadSkinResources(imageSkin(), { resolve: async () => new Uint8Array(60) })).rejects.toThrow(/PNG/)
    await expect(loadSkinResources(imageSkin(), { resolve: async () => (await png()).subarray(0, 44) })).rejects.toThrow(/PNG/)
  })

  it.each(['/absolute.png', '../escape.png', 'assets/../escape.png', 'https://example.test/a.png', 'assets/%2e%2e/a.png', 'assets\\a.png', 'data:image/svg+xml;base64,AAAA', 'assets/a.jpg'])('rejects unsupported image source %s', (src) => {
    expect(() => parseSkin(imageSkin(src))).toThrow()
  })

  it('cleans up previously decoded resources if a later resource fails', async () => {
    const skin = imageSkin()
    skin.frames.b = { type: 'image', src: 'assets/second.png', x: 0, y: 0, w: 1, h: 1 }
    const close = vi.fn()
    await expect(loadSkinResources(skin, {
      resolve: async path => path.includes('second') ? new Uint8Array() : png(),
      decode: async () => ({ close }) as unknown as ImageBitmap,
    })).rejects.toThrow()
    expect(close).toHaveBeenCalledOnce()
  })
})
