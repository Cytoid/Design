import type { SceneNode, Skin, SkinLayersAnimation } from '@cytoid/notes'
import { createCylheimTargets, rasterize } from '@cytoid/design-tools'
import { compileAnimation, compileSkin, NOTE_KINDS, parseSkin, toSVG } from '@cytoid/notes'
import { createContext, designs, flat, flatSkin, holdBodyAlpha, loadSkin, renderNote, tokens } from '@cytoid/skin-flat'
import { describe, expect, it, vi } from 'vitest'
import { feedbackBindings } from '../../notes/src/skin/slots'
import { buildFlatSkin } from '../scripts/gen-skin'
import flatDocument from '../src/flat.skin.json'
import { designs as reference } from './golden/reference'

function fragment(): Skin & { animations: Record<string, SkinLayersAnimation> } {
  return {
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    frames: { dot: { type: 'circle', r: 1, fill: '#ffffff' } },
    animations: {
      grow: {
        type: 'layers',
        tracks: { radius: { keys: [{ at: 0, value: 1 }, { at: 1, value: 9 }] } },
        layers: [{ source: { frame: 'dot' }, properties: { r: { track: 'radius' } } }],
      },
    },
    slots: {},
  }
}
function circle(node: SceneNode): Extract<SceneNode, { type: 'circle' }> {
  if (node.type === 'circle')
    return node
  if (node.type === 'group') {
    for (const child of node.children) {
      try {
        return circle(child)
      }
      catch { /* try the next branch */ }
    }
  }
  throw new Error('no circle')
}
function draw(skin: Skin, id = 'grow') {
  return compileAnimation(skin, id)
}
const ctx = createContext('click')

function complete(skin: Skin): Skin {
  for (const kind of NOTE_KINDS) {
    for (const path of ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad']) skin.slots[`${kind}:${path}`] = { animation: 'grow' }
  }
  skin.slots['hold:body'] = { animation: 'grow' }
  skin.slots['long-hold:body'] = { animation: 'grow' }
  for (const binding of feedbackBindings) skin.slots[binding.name] = { animation: 'grow' }
  return skin
}

// Transcendental functions can differ in their last bits across platforms.
// Keep keys, array order and nonnumeric values exact; only numbers get a
// 12-decimal-place tolerance. Both documents still pass the strict schema.
function withNumericTolerance(value: unknown): unknown {
  if (typeof value === 'number')
    return expect.closeTo(value, 12)
  if (Array.isArray(value))
    return value.map(withNumericTolerance)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withNumericTolerance(child)]))
  return value
}

describe('skin loader and engine clocks', () => {
  it('ships and loads the current schema', () => {
    expect(flatSkin.schemaVersion).toBe(2)
    expect(loadSkin(flatDocument).click.enter.draw(0.5, ctx)).toEqual(designs.click.enter.draw(0.5, ctx))
  })

  it('rejects unsupported schema versions without another loader branch', () => {
    expect(() => loadSkin({ ...fragment(), schemaVersion: 99 })).toThrow()
  })

  it('adapts once, normalized, progress, static and loop clocks', () => {
    const skin = complete(fragment())
    skin.slots['hold:press'] = { animation: 'grow' }
    skin.slots['hold:progress'] = { animation: 'grow' }
    skin.slots['hold:loopUnder'] = { animation: 'grow' }
    skin.slots['hold:body'] = { animation: 'grow' }
    skin.slots['long-hold:body'] = { animation: 'grow' }
    const d = compileSkin(skin)
    expect(circle(d.click.enter.draw(0.5, ctx)).r).toBe(5)
    expect(circle(d.click.clear.perfect.draw(tokens.time.clear.perfect / 2, ctx)).r).toBe(5)
    const hold = createContext('hold')
    expect(circle(d.hold.hold!.progress.draw(0.5, hold)).r).toBe(5)
    expect(circle(d.hold.hold!.press.draw(tokens.time.holdPress / 2, hold)).r).toBe(5)
    expect(circle(d.hold.hold!.loopUnder!.draw(1, hold)).r).toBe(1)
    expect(circle(d.hold.hold!.loopUnder!.draw(1.5, hold)).r).toBe(5)
    expect(circle(d.hold.hold!.loopUnder!.draw(-0.5, hold)).r).toBe(5)
    expect(circle(d['drop-click'].enter.draw(100, createContext('drop-click'))).r).toBe(1)
  })

  it('falls back by whole kind when any required slot is absent', () => {
    const skin = fragment()
    skin.slots['click:enter'] = { animation: 'grow' }
    expect(() => compileSkin(skin)).toThrow(/missing required slots/)
    const result = loadSkin(skin, designs)
    expect(result.click).toBe(designs.click)
    expect(result.hold).toBe(designs.hold)
  })

  it('uses the selected skin when deciding whether a missed hold body remains visible', () => {
    const selected = { ...designs, hold: { ...designs.hold, exit: undefined } }
    const state = { phase: 'miss', t: 0.01, since: 0.05 } as const
    expect(holdBodyAlpha('hold', state)).toBeGreaterThan(0)
    expect(holdBodyAlpha('hold', state, selected)).toBe(0)
  })

  it('rejects nonfinite drivers', () => {
    expect(() => draw(fragment())(Number.NaN, ctx)).toThrow(/finite/)
    expect(() => compileSkin(complete(fragment())).click.enter.draw(Infinity, ctx)).toThrow(/finite/)
  })

  it('binds a partial skin to rendering and baking', () => {
    const example = fragment()
    for (const path of ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad'])
      example.slots[`click:${path}`] = { animation: 'grow' }
    const loaded = loadSkin(example, designs)
    expect(loaded.click).not.toBe(designs.click)
    expect(loaded.hold).toBe(designs.hold)
    expect(toSVG(loaded.click.enter.draw(1, ctx))).toContain('<circle')
    expect(renderNote('click', { phase: 'enter', p: 0.5 }, ctx, { skin: loaded })).toEqual(loaded.click.enter.draw(0.5, ctx))
    const target = createCylheimTargets({ ...flat, designs: loaded }).find(target => target.pattern.startsWith('Note-Click-Enter'))!
    expect(target.draw(0.5, ctx)).toEqual(loaded.click.enter.draw(0.5, ctx))
  })

  it('bakes pixel-identical PNGs for every kind at entrance and judgement poses', () => {
    const previous = reference
    for (const kind of NOTE_KINDS) {
      const context = createContext(kind)
      for (const [before, after, time] of [
        [previous[kind].enter, designs[kind].enter, 0.5],
        [previous[kind].enter, designs[kind].enter, 1],
        [previous[kind].clear.perfect, designs[kind].clear.perfect, 0.2],
      ] as const) {
        const expected = rasterize(before.draw(time, context), 320, 320, 160, 160)
        const actual = rasterize(after.draw(time, context), 320, 320, 160, 160)
        expect(actual.equals(expected), `${kind}@${time}`).toBe(true)
      }
    }
  })

  it('regenerates the checked-in skin within floating-point precision', () => {
    const expected = withNumericTolerance(parseSkin(flatDocument))
    expect(parseSkin(buildFlatSkin())).toEqual(expected)
    buildFlatSkin({ color: '#111111', placement: 'inside', bands: [] })
    expect(parseSkin(buildFlatSkin())).toEqual(expected)
    expect(toSVG(designs.click.enter.draw(1, ctx))).toContain('<circle')
  })

  it('accepts platform-sized roundoff in generated trigonometric values', () => {
    const sin = Math.sin
    const spy = vi.spyOn(Math, 'sin').mockImplementation(x => sin(x) * (1 + Number.EPSILON))
    try {
      expect(parseSkin(buildFlatSkin())).toEqual(withNumericTolerance(parseSkin(flatDocument)))
    }
    finally {
      spy.mockRestore()
    }
  })

  it('still rejects changed values, references, fields and array order', () => {
    const expected = withNumericTolerance({ r: 0.3, source: 'ring', keys: [0.2, 0.8] })
    for (const actual of [
      { r: 0.300001, source: 'ring', keys: [0.2, 0.8] },
      { r: 0.3, source: 'core', keys: [0.2, 0.8] },
      { source: 'ring', keys: [0.2, 0.8] },
      { r: 0.3, source: 'ring', keys: [0.8, 0.2] },
    ]) {
      expect(() => expect(actual).toEqual(expected)).toThrow()
    }
  })
})
