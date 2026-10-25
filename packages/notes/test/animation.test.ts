import type { DrawContext, SceneNode, Skin, SkinLayersAnimation } from '../src'
import { describe, expect, it } from 'vitest'
import { compileAnimation, compileSkin, composeNote, derivePalette, NOTE_KINDS, parseSkin } from '../src'
import { feedbackBindings } from '../src/skin/slots'

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
const ctx: DrawContext = {
  kind: 'click',
  palette: derivePalette(200, { chroma: 0.165 }),
  colors: {
    family: () => derivePalette(200, { chroma: 0.165 }),
    note: () => derivePalette(200, { chroma: 0.165 }),
    grade: { perfect: '#00ffff', great: '#ffff00', good: '#00ff00', bad: '#ff0000', miss: '#808080' },
    ring: '#ffffff',
  },
  grades: { perfect: '#00ffff', great: '#ffff00', good: '#00ff00', bad: '#ff0000', miss: '#808080' },
  direction: 'up',
  bodyDirection: 'up',
  heading: 0,
  approach: 1.2,
  unit: 128,
  size: 128,
  ringStroke: 10.88,
  hairStroke: 2.816,
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
    skin.animations.mapped = { type: 'layers', layers: [{ at, until, source: { animation: 'grow', sample: { from, to } } }] }
    expect(circle(draw(skin, 'mapped')(p, ctx)).r).toBeCloseTo(radius)
  })

  it('owns interval boundaries and includes the final pose', () => {
    const skin = fragment()
    skin.animations.windowed = { type: 'layers', layers: [{ at: 0.2, until: 0.8, source: { animation: 'grow' } }] }
    const sample = draw(skin, 'windowed')
    expect(sample(0.199999, ctx)).toMatchObject({ children: [] })
    expect(circle(sample(0.2, ctx)).r).toBe(1)
    expect(sample(0.8, ctx)).toMatchObject({ children: [] })
    skin.animations.windowed.layers[0]!.until = 1
    expect(circle(draw(skin, 'windowed')(1, ctx)).r).toBe(9)
  })

  it('composes nested trims and returns independent trees on random seeks', () => {
    const skin = fragment()
    skin.animations.half = { type: 'layers', layers: [{ source: { animation: 'grow', sample: { from: 0.25, to: 0.75 } } }] }
    skin.animations.reverse = { type: 'layers', layers: [{ source: { animation: 'half', sample: { from: 1, to: 0 } } }] }
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
    skin.animations.instance = { type: 'layers', layers: [{ source: { frame: 'dot' }, properties: { transform: { x: 5, rotate: 0.5, scale: 2 } } }] }
    skin.animations.outer = { type: 'layers', layers: [{ source: { animation: 'instance' }, properties: { opacity: 0.5, transform: { y: 2 } } }] }
    const tree = draw(skin, 'outer')(0.5, ctx)
    expect(tree).toMatchObject({ children: [{ type: 'group', opacity: 0.5, isolate: true, transform: { y: 2 }, children: [{ children: [{ transform: { x: 5, rotate: 0.5, scale: 2 } }] }] }] })
  })

  it('supports structured easing, shape properties and semantic palette colors', () => {
    const skin = fragment()
    skin.animations.grow!.tracks = { radius: { keys: [{ at: 0, value: 1 }, { at: 1, value: 9, ease: { type: 'inPow', power: 2 } }] } }
    skin.frames.dot = { type: 'circle', r: 1, fill: 'theme:400' }
    expect(circle(draw(skin)(0.5, ctx))).toMatchObject({ r: 3, fill: ctx.palette[400] })
  })
})

describe('skin rejects invalid documents at load time', () => {
  it.each([
    ['unknown fields', (s: ReturnType<typeof fragment>) => { Object.assign(s.frames.dot!, { typo: 1 }) }],
    ['animated frames', (s: ReturnType<typeof fragment>) => { Object.assign(s.frames.dot!, { r: { track: 'radius' } }) }],
    ['tuple parameters', (s: ReturnType<typeof fragment>) => { Object.assign(s.frames.dot!, { type: 'poly', points: [[0, 1]] }) }],
    ['string expressions', (s: ReturnType<typeof fragment>) => { Object.assign(s.animations.grow!.tracks!, { radius: { ease: 'outBack(2)' } }) }],
    ['unknown frame', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.source = { frame: 'missing' } }],
    ['unknown animation', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.source = { animation: 'missing' } }],
    ['unknown track', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.properties = { r: { track: 'missing' } } }],
    ['unknown slot', (s: ReturnType<typeof fragment>) => { s.slots['click:unknown'] = { animation: 'grow' } }],
    ['direct cycle', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers.push({ source: { animation: 'grow' } }) }],
    ['indirect cycle', (s: ReturnType<typeof fragment>) => {
      s.animations.next = { type: 'layers', layers: [{ source: { animation: 'grow' } }] }
      s.animations.grow!.layers.push({ source: { animation: 'next' } })
    }],
    ['invalid property', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.properties = { assemble: 1 } }],
    ['zero interval', (s: ReturnType<typeof fragment>) => { Object.assign(s.animations.grow!.layers[0]!, { at: 0.5, until: 0.5 }) }],
    ['duplicate keys', (s: ReturnType<typeof fragment>) => { s.animations.grow!.tracks = { radius: { keys: [{ at: 0, value: 1 }, { at: 0, value: 2 }] } } }],
    ['missing context', (s: ReturnType<typeof fragment>) => {
      s.animations.grow!.layers[0]!.properties = { r: { input: 'holdLanding' } }
      s.slots['click:enter'] = { animation: 'grow' }
    }],
    ['nonfinite value', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.properties = { r: Infinity } }],
    ['invalid clamp', (s: ReturnType<typeof fragment>) => { s.animations.grow!.layers[0]!.properties = { r: { clamp: { value: 1, min: 2, max: 1 } } } }],
  ])('%s', (_name, mutate) => {
    const skin = fragment()
    mutate(skin)
    expect(() => draw(skin)).toThrow()
  })

  it('bounds expanded animation graphs, not just the number of definitions', () => {
    const skin = fragment()
    for (let i = 0; i < 20; i++) {
      const animation = i === 0 ? 'grow' : `branch${i - 1}`
      skin.animations[`branch${i}`] = { type: 'layers', layers: [{ source: { animation } }, { source: { animation } }] }
    }
    expect(() => draw(skin)).toThrow(/budget/)
  })

  it('bounds recursive JSON and rejects cyclic JS documents before schema parsing', () => {
    const skin = fragment()
    Object.assign(skin, { self: skin })
    expect(() => parseSkin(skin)).toThrow(/cyclic/)
  })
})

describe('appearance-independent note composition', () => {
  it('composes supplied clips and overlays without selecting a default design', () => {
    const doc = fragment()
    for (const kind of NOTE_KINDS) {
      for (const slot of ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad']) doc.slots[`${kind}:${slot}`] = { animation: 'grow' }
    }
    doc.slots['hold:body'] = { animation: 'grow' }
    doc.slots['long-hold:body'] = { animation: 'grow' }
    for (const binding of feedbackBindings) doc.slots[binding.name] = { animation: 'grow' }
    const skin = compileSkin(doc)
    const judgement = { type: 'rect', x: 0, y: 0, w: 1, h: 1 } as const
    const timing = { type: 'line', x1: 0, y1: 0, x2: 1, y2: 0 } as const
    skin.feedback.combined.great.fast = { ...skin.feedback.combined.great.fast, draw: () => ({ type: 'group', children: [judgement, timing] }) }
    const tree = composeNote('click', { phase: 'clear', grade: 'great', t: 0.2, timing: 'fast' }, ctx, skin)
    expect(tree.type).toBe('group')
    expect(tree.type === 'group' && tree.children.slice(1)).toEqual([{ type: 'group', children: [judgement, timing] }])
    expect(composeNote('click', { phase: 'enter', p: 0.5 }, ctx, skin)).toEqual(skin.click.enter.draw(0.5, ctx))
  })
})

describe('driven numeric tracks and body drawing primitives', () => {
  it('samples dependent drivers and compares gates against their driven phase', () => {
    const skin = fragment()
    skin.animations.grow!.tracks = {
      amount: { ease: { type: 'inQuad' } },
      radius: { driver: { track: 'amount' }, keys: [{ at: 0, value: 1 }, { at: 1, value: 9 }] },
    }
    skin.animations.grow!.layers[0]!.when = { track: 'radius', phase: true, until: 0.3 }
    expect(circle(draw(skin)(0.5, ctx)).r).toBe(3)
    expect(draw(skin)(0.8, ctx)).toMatchObject({ children: [] })
  })

  it('rejects direct and indirect driver cycles, including unused tracks', () => {
    for (const indirect of [false, true]) {
      const skin = fragment()
      skin.animations.grow!.tracks!.unused = { ease: { type: 'linear' }, driver: { track: indirect ? 'other' : 'unused' } }
      if (indirect)
        skin.animations.grow!.tracks!.other = { ease: { type: 'linear' }, driver: { track: 'unused' } }
      expect(() => draw(skin)).toThrow(/track dependency cycle/)
    }
  })

  it('bounds dependency depth even when earlier traversals cached shared tracks', () => {
    const skin = fragment()
    for (let i = 0; i < 33; i++) {
      skin.animations.grow!.tracks![`driver${i}`] = { ease: { type: 'linear' }, driver: i === 0 ? 0 : { track: `driver${i - 1}` } }
    }
    expect(() => draw(skin)).toThrow(/track dependency depth/)
  })

  it('renders rectangular clips and animated dash lengths and offsets', () => {
    const skin = fragment()
    skin.frames.mask = { type: 'group', clip: { type: 'rect', x: -5, y: -10, w: 10, h: 20 } }
    skin.frames.line = { type: 'line', x1: 0, y1: 0, x2: 0, y2: 20, stroke: 'theme:400', strokeWidth: 2, dash: [2, 3] }
    skin.animations.grow!.layers = [{
      source: { frame: 'mask' },
      properties: { clip: { type: 'rect', x: -5, y: 0, w: 10, h: { track: 'radius' } } },
      layers: [{ source: { frame: 'line' }, properties: { dash: [{ track: 'radius' }, 3], dashOffset: { track: 'radius' } } }],
    }]
    expect(draw(skin)(0.5, ctx)).toMatchObject({ children: [{ clip: { type: 'rect', x: -5, y: 0, w: 10, h: 5 }, children: [{ dash: [5, 3], dashOffset: 5 }] }] })
  })
})
