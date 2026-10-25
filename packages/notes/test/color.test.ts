import type { DrawContext, SceneNode, Skin, SkinColor, SkinTrack } from '../src'
import { describe, expect, it } from 'vitest'
import { compileAnimation, compileSkin, derivePalette, FAMILIES, gradePalette, GRADES, mix, NOTE_KINDS, parseSkin, ringTone, SHADES } from '../src'

const grades = { perfect: '#00ffff', great: '#ffff00', good: '#00ff00', bad: '#ff0000', miss: '#808080' }
const up = derivePalette('#ff0000', { chroma: 0 })
const down = derivePalette('#0000ff', { chroma: 0 })
const ctx: DrawContext = {
  kind: 'click',
  palette: up,
  grades,
  colors: { family: (_, dir) => dir === 'up' ? up : down, note: () => up, grade: grades, ring: '#ffffff' },
  direction: 'up',
  bodyDirection: 'up',
  heading: 0,
  approach: 1.2,
  unit: 128,
  size: 128,
  ringStroke: 10,
  hairStroke: 2,
}
function document(fill: SkinColor = 'theme:400', track?: SkinTrack): Skin {
  return {
    schemaVersion: 2,
    id: 'color',
    name: 'Color',
    frames: { dot: { type: 'circle', r: 1, fill } },
    animations: {
      color: { ...(track ? { tracks: { color: track } } : {}), layers: [{ source: { frame: 'dot' }, ...(track ? { properties: { fill: { track: 'color' } } } : {}) }] },
      nested: { layers: [{ source: { animation: 'color' } }] },
    },
    slots: {},
  }
}
function fill(node: SceneNode): string {
  if (node.type === 'circle')
    return node.fill!
  if (node.type === 'group')
    return fill(node.children[0]!)
  throw new Error('expected circle')
}
function sample(skin: Skin, p = 0.5, context = ctx, id = 'color'): string {
  return fill(compileAnimation(skin, id)(p, context))
}
const gradient = () => ({ keys: [{ at: 0, value: '#ff0000' as const }, { at: 1, value: '#0000ff' as const }] })

describe('string colors', () => {
  it('accepts every named scale and supported shade', () => {
    for (const type of ['ring', 'theme', ...FAMILIES, ...GRADES] as const) {
      for (const shade of SHADES) expect(() => parseSkin(document(`${type}:${shade}`))).not.toThrow()
    }
    for (const hex of ['#abc', '#abcd', '#AABBCC', '#AABBCCDD'] as const)
      expect(sample(document(hex))).toBe(hex)
  })

  it.each(['red', '#12', '#12345', '#gggggg', 'theme:350', 'ring:1', 'palette:400', 'shade:400', 'unknown:400', 'click:0400', 'theme:400:500'])('rejects invalid literal %s', (color) => {
    expect(() => parseSkin(document(color as SkinColor))).toThrow()
  })

  it.each([{ shade: 400 }, { ring: 50 }, { grade: 'perfect' }, { palette: 'fill' }])('removes the old color object %j', (color) => {
    expect(() => parseSkin(document(color as unknown as SkinColor))).toThrow()
  })

  it('resolves theme, named grades, named families and ring independently', () => {
    expect(sample(document())).toBe(up[400])
    expect(sample(document('hold:700'), 0.5, { ...ctx, direction: 'down' })).toBe(down[700])
    expect(sample(document('perfect:400'))).toBe(grades.perfect)
    expect(sample(document('perfect:800'))).toBe(gradePalette(grades, 'perfect')[800])
    expect(sample(document('ring:50'), 0.5, { ...ctx, palette: { ...up, ring: '#123456' }, grade: 'bad' })).toBe('#123456')
    expect(sample(document('ring:700'))).toBe(ringTone(up, 700))
  })

  it('binds theme to slots through reused nested animations without mutating context', () => {
    const skin = document('theme:800')
    for (const kind of NOTE_KINDS) {
      for (const slot of ['enter', 'miss', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad'])
        skin.slots[`${kind}:${slot}`] = { animation: 'nested' }
    }
    skin.slots['click:exit'] = { animation: 'nested' }
    for (const slot of ['press', 'progress', 'loopUnder']) skin.slots[`hold:${slot}`] = { animation: 'nested' }
    skin.slots['hold:body'] = { animation: 'nested' }
    skin.slots['long-hold:body'] = { animation: 'nested' }
    const d = compileSkin(skin)
    const context = { ...ctx, grade: 'bad' as const }
    expect(fill(d.click.clear.perfect.draw(0.1, context))).toBe(gradePalette(grades, 'perfect')[800])
    expect(fill(d.click.clear.great.draw(0.1, context))).toBe(gradePalette(grades, 'great')[800])
    expect(fill(d.click.miss!.draw(0.1, context))).toBe(gradePalette(grades, 'miss')[800])
    expect(fill(d.click.enter.draw(0.5, context))).toBe(up[800])
    expect(fill(d.click.exit!.draw(0.1, context))).toBe(up[800])
    expect(fill(d.hold.hold!.press.draw(0.1, context))).toBe(up[800])
    expect(fill(d.hold.hold!.progress.draw(0.5, context))).toBe(up[800])
    expect(fill(d.hold.hold!.loopUnder!.draw(0.5, context))).toBe(up[800])
    expect(context.grade).toBe('bad')
  })
})

describe('oKLab interpolation', () => {
  it('uses perceptual lightness and Cartesian a/b interpolation', () => {
    expect(mix('#000', '#fff', 0.5)).toBe('#636363')
    expect(mix('#ff0000', '#0000ff', 0.5)).toBe('#8c53a2')
    expect(mix('#F00', '#00F', 0)).toBe('#F00')
    expect(mix('#F00', '#00F', 1)).toBe('#00F')
  })

  it('premultiplies alpha so hidden colors do not bleed into a fade', () => {
    expect(mix('#f000', '#00ff', 0.5)).toBe('#0000ff80')
    expect(mix('#ff000000', '#0000ff00', 0.5)).toBe('#00000000')
    expect(mix('#f008', '#00f8', 0.5)).toBe('#8c53a288')
  })

  it('resolves color tokens before blending and supports stroke bindings', () => {
    const skin = document('theme:400', { keys: [{ at: 0, value: 'theme:400' }, { at: 1, value: 'perfect:400' }] })
    skin.animations.color!.layers[0]!.properties!.stroke = { track: 'color' }
    const result = compileAnimation(skin, 'color')(0.5, ctx)
    expect(result).toMatchObject({ children: [{ fill: mix(up[400], grades.perfect, 0.5), stroke: mix(up[400], grades.perfect, 0.5) }] })
  })

  it('shares easing, window, offset and rate semantics with numeric keyframes', () => {
    expect(sample(document('theme:400', { keys: [{ at: 0, value: '#f00' }, { at: 1, value: '#00f', ease: { type: 'inQuad' } }] }))).toBe(mix('#f00', '#00f', 0.25))
    expect(sample(document('theme:400', { keys: [{ at: 0, value: '#f00' }, { at: 1, value: '#00f', ease: { type: 'inQuad' }, window: { from: 0.25, to: 0.75 } }] }), 0.25)).toBe('#f00')
    expect(sample(document('theme:400', { ...gradient(), offset: 0.25, rate: 2 }), 0.5)).toBe(mix('#ff0000', '#0000ff', 0.25))
    const skin = document('theme:400', gradient())
    skin.animations.nested!.layers[0]!.source = { animation: 'color', sample: { from: 1, to: 0 } }
    expect(sample(skin, 0.25, ctx, 'nested')).toBe(mix('#ff0000', '#0000ff', 0.75))
  })

  it('clamps overshoot within its own color segment', () => {
    const skin = document('theme:400', { keys: [{ at: 0, value: '#f00' }, { at: 0.5, value: '#00f', ease: { type: 'outBack', amount: 3 } }, { at: 1, value: '#0f0' }] })
    expect(sample(skin, 0.4)).toBe('#00f')
  })

  it('supports driven color ramps and validates driver references at load time', () => {
    const skin = document('theme:400', { keys: [{ at: 0, value: '#f00' }, { at: 1, value: '#00f' }], driver: { track: 'amount' } })
    skin.animations.color!.tracks!.amount = { ease: { type: 'inQuad' } }
    expect(sample(skin)).toBe(mix('#f00', '#00f', 0.25))
    skin.animations.color!.tracks!.amount = gradient()
    expect(() => compileAnimation(skin, 'color')).toThrow(/numeric track/)
  })

  it('rejects mixed keys and binding a numeric track as a color or vice versa', () => {
    const mixed = document('theme:400', gradient())
    Object.assign(mixed.animations.color!.tracks!.color!, { keys: [{ at: 0, value: '#f00' }, { at: 1, value: 2 }] })
    expect(() => compileAnimation(mixed, 'color')).toThrow()
    const numeric = document('theme:400', { ease: { type: 'linear' } })
    expect(() => compileAnimation(numeric, 'color')).toThrow(/color track/)
    const wrong = document('theme:400', gradient())
    wrong.animations.color!.properties = { opacity: { track: 'color' } }
    expect(() => compileAnimation(wrong, 'color')).toThrow(/numeric track/)
    wrong.animations.color!.properties = undefined
    wrong.animations.color!.layers[0]!.when = { track: 'color', from: 0.5 }
    expect(() => compileAnimation(wrong, 'color')).toThrow(/numeric track/)
  })
})
