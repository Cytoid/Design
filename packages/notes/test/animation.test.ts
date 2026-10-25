import type { SceneNode } from '../src/core/scene'
import type { Skin } from '../src/skin/schema'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildFlatSkin } from '../scripts/gen-skin'
import { createContext, designs, flatSkin, holdBodyAlpha, loadSkin, renderNote } from '../src'
import { createCylheimTargets } from '../src/bake/cylheim'
import { rasterize } from '../src/bake/index'
import { toSVG } from '../src/render/svg'
import { compileAnimation, compileSkin, parseSkin } from '../src/skin'
import flatDocument from '../src/skin/flat.skin.json'
import { NOTE_KINDS, tokens } from '../src/tokens'
import { designs as reference } from './golden/reference'

function fragment(): Skin {
  return {
    schemaVersion: 2,
    id: 'test',
    name: 'Test',
    frames: { dot: { type: 'circle', r: 1, fill: '#ffffff' } },
    animations: {
      grow: {
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
  return skin
}

describe('skin animation composition', () => {
  it.each([
    ['forward', 0, 1, 0, 1, 0.25, 3],
    ['reverse', 0, 1, 1, 0, 0.25, 7],
    ['fragment', 0, 1, 0.25, 0.75, 0.5, 5],
    ['double speed', 0, 0.5, 0, 1, 0.25, 5],
    ['still', 0, 1, 0.5, 0.5, 0.9, 5],
    ['reverse fragment', 0.2, 0.8, 0.8, 0.2, 0.5, 5],
  ])('%s samples directly from the parent clock', (_name, at, until, from, to, p, radius) => {
    const skin = fragment()
    skin.animations.mapped = { layers: [{ at, until, source: { animation: 'grow', sample: { from, to } } }] }
    expect(circle(draw(skin, 'mapped')(p, ctx)).r).toBeCloseTo(radius)
  })

  it('owns interval boundaries and includes the final pose', () => {
    const skin = fragment()
    skin.animations.windowed = { layers: [{ at: 0.2, until: 0.8, source: { animation: 'grow' } }] }
    const sample = draw(skin, 'windowed')
    expect(sample(0.199999, ctx)).toMatchObject({ children: [] })
    expect(circle(sample(0.2, ctx)).r).toBe(1)
    expect(sample(0.8, ctx)).toMatchObject({ children: [] })
    skin.animations.windowed.layers[0]!.until = 1
    expect(circle(draw(skin, 'windowed')(1, ctx)).r).toBe(9)
  })

  it('composes nested trims and returns independent trees on random seeks', () => {
    const skin = fragment()
    skin.animations.half = { layers: [{ source: { animation: 'grow', sample: { from: 0.25, to: 0.75 } } }] }
    skin.animations.reverse = { layers: [{ source: { animation: 'half', sample: { from: 1, to: 0 } } }] }
    const sample = draw(skin, 'reverse')
    const first = sample(0.2, ctx)
    expect(circle(first).r).toBeCloseTo(6.2)
    circle(first).r = 999
    sample(0.9, ctx)
    expect(circle(sample(0.2, ctx)).r).toBeCloseTo(6.2)
    expect(skin.frames.dot).toMatchObject({ r: 1 })
  })

  it('wraps primitive transforms and composes opacity on isolated animation groups', () => {
    const skin = fragment()
    skin.animations.instance = { layers: [{ source: { frame: 'dot' }, properties: { transform: { x: 5, rotate: 0.5, scale: 2 } } }] }
    skin.animations.outer = { layers: [{ source: { animation: 'instance' }, properties: { opacity: 0.5, transform: { y: 2 } } }] }
    const tree = draw(skin, 'outer')(0.5, ctx)
    expect(tree).toMatchObject({ children: [{ type: 'group', opacity: 0.5, isolate: true, transform: { y: 2 }, children: [{ children: [{ transform: { x: 5, rotate: 0.5, scale: 2 } }] }] }] })
  })

  it('supports structured easing, shape properties and semantic palette colors', () => {
    const skin = fragment()
    skin.animations.grow!.tracks = { radius: { keys: [{ at: 0, value: 1 }, { at: 1, value: 9, ease: { type: 'inPow', power: 2 } }] } }
    skin.frames.dot = { type: 'circle', r: 1, fill: { palette: 'fill' } }
    expect(circle(draw(skin)(0.5, ctx))).toMatchObject({ r: 3, fill: ctx.palette[400] })
  })
})

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

  it('compiles the documented example and binds its complete click kinds', () => {
    const example = JSON.parse(readFileSync(new URL('../../../docs/skin.example.json', import.meta.url), 'utf8'))
    const loaded = loadSkin(example, designs)
    expect(loaded.click).not.toBe(designs.click)
    expect(loaded.hold).toBe(designs.hold)
    expect(toSVG(loaded.click.enter.draw(1, ctx))).toContain('<circle')
    expect(renderNote('click', { phase: 'enter', p: 0.5 }, ctx, { skin: loaded })).toEqual(loaded.click.enter.draw(0.5, ctx))
    const target = createCylheimTargets(loaded).find(target => target.pattern.startsWith('Note-Click-Enter'))!
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

  it('regenerates the exact checked-in skin asset and feeds the SVG renderer', () => {
    expect(buildFlatSkin()).toEqual(parseSkin(flatDocument))
    buildFlatSkin({ color: '#111111', placement: 'inside', bands: [] })
    expect(buildFlatSkin()).toEqual(parseSkin(flatDocument))
    expect(toSVG(designs.click.enter.draw(1, ctx))).toContain('<circle')
  })
})

describe('skin rejects invalid documents at load time', () => {
  it.each([
    ['unknown fields', (s: Skin) => { Object.assign(s.frames.dot!, { typo: 1 }) }],
    ['animated frames', (s: Skin) => { Object.assign(s.frames.dot!, { r: { track: 'radius' } }) }],
    ['tuple parameters', (s: Skin) => { Object.assign(s.frames.dot!, { type: 'poly', points: [[0, 1]] }) }],
    ['string expressions', (s: Skin) => { Object.assign(s.animations.grow!.tracks!, { radius: { ease: 'outBack(2)' } }) }],
    ['unknown frame', (s: Skin) => { s.animations.grow!.layers[0]!.source = { frame: 'missing' } }],
    ['unknown animation', (s: Skin) => { s.animations.grow!.layers[0]!.source = { animation: 'missing' } }],
    ['unknown track', (s: Skin) => { s.animations.grow!.layers[0]!.properties = { r: { track: 'missing' } } }],
    ['unknown slot', (s: Skin) => { s.slots['click:unknown'] = { animation: 'grow' } }],
    ['direct cycle', (s: Skin) => { s.animations.grow!.layers.push({ source: { animation: 'grow' } }) }],
    ['indirect cycle', (s: Skin) => {
      s.animations.next = { layers: [{ source: { animation: 'grow' } }] }
      s.animations.grow!.layers.push({ source: { animation: 'next' } })
    }],
    ['invalid property', (s: Skin) => { s.animations.grow!.layers[0]!.properties = { assemble: 1 } }],
    ['zero interval', (s: Skin) => { Object.assign(s.animations.grow!.layers[0]!, { at: 0.5, until: 0.5 }) }],
    ['duplicate keys', (s: Skin) => { s.animations.grow!.tracks = { radius: { keys: [{ at: 0, value: 1 }, { at: 0, value: 2 }] } } }],
    ['missing context', (s: Skin) => {
      s.animations.grow!.layers[0]!.properties = { r: { input: 'holdLanding' } }
      s.slots['click:enter'] = { animation: 'grow' }
    }],
    ['nonfinite value', (s: Skin) => { s.animations.grow!.layers[0]!.properties = { r: Infinity } }],
    ['invalid clamp', (s: Skin) => { s.animations.grow!.layers[0]!.properties = { r: { clamp: { value: 1, min: 2, max: 1 } } } }],
  ])('%s', (_name, mutate) => {
    const skin = fragment()
    mutate(skin)
    expect(() => draw(skin)).toThrow()
  })

  it('bounds expanded animation graphs, not just the number of definitions', () => {
    const skin = fragment()
    for (let i = 0; i < 20; i++) {
      const animation = i === 0 ? 'grow' : `branch${i - 1}`
      skin.animations[`branch${i}`] = { layers: [{ source: { animation } }, { source: { animation } }] }
    }
    expect(() => draw(skin)).toThrow(/budget/)
  })

  it('bounds recursive JSON and rejects cyclic JS documents before schema parsing', () => {
    const skin = fragment()
    Object.assign(skin, { self: skin })
    expect(() => parseSkin(skin)).toThrow(/cyclic/)
  })
})
