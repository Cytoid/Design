/**
 * Golden tests: the compiled skin must produce exactly the trees the
 * imperative designs produce — same node shapes, same field presence, same
 * gated-out absences — across every kind × slot × sampled driver × context.
 * This is the acceptance contract the C# interpreter will be held to as well
 * (it loads this same JSON and must match the same trees).
 */
import type { SceneNode } from '../src'
import type { Clip, DrawContext, NoteDesign } from '../src/notes/types'
import type { Skin } from '../src/skin/schema'
import type { NoteKind } from '../src/tokens'
import { describe, expect, it } from 'vitest'
import {
  createContext,
  hexToOklch,
  designs as imperative,
  NOTE_KINDS,
} from '../src'
import { createPalette } from '../src/palette'
import flatSkinJson from '../src/skin/flat.skin.json'
import { compileSkin } from '../src/skin/interpret'
import { parseSkin } from '../src/skin/schema'

const compiled = compileSkin(parseSkin(flatSkinJson))

/* ------------------------------------------------------------------ */
/* tree comparison — strict shape, numeric tolerance, color normalization */

function colorEq(a: string, b: string): boolean {
  if (a === b)
    return true
  if (!a.startsWith('#') || !b.startsWith('#'))
    return false
  // spellings may differ (`ctx.palette.ring` vs `ringTone(…, 1)`) but the color must agree
  const ca = hexToOklch(a)
  const cb = hexToOklch(b)
  const dh = ((ca.h - cb.h + 540) % 360) - 180
  return Math.abs(ca.l - cb.l) <= 1e-9 && Math.abs(ca.c - cb.c) <= 1e-9 && Math.abs(dh) <= 1e-9
}

function numEq(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
}

export function compareTrees(a: unknown, b: unknown, path: string): string | null {
  if (typeof a === 'number' && typeof b === 'number')
    return numEq(a, b) ? null : `${path}: ${a} ≠ ${b}`
  if (typeof a === 'string' && typeof b === 'string')
    return colorEq(a, b) ? null : `${path}: "${a}" ≠ "${b}"`
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object')
    return a === b ? null : `${path}: ${String(a)} ≠ ${String(b)}`
  // imperative nodes carry explicitly-undefined optional keys — treat as absent
  const oa = a as Record<string, unknown>
  const ob = b as Record<string, unknown>
  const ka = Object.keys(oa).filter(k => oa[k] !== undefined).sort()
  const kb = Object.keys(ob).filter(k => ob[k] !== undefined).sort()
  if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i]))
    return `${path}: keys [${ka}] ≠ [${kb}]`
  for (const k of ka) {
    const err = compareTrees(oa[k], ob[k], `${path}.${k}`)
    if (err)
      return err
  }
  return null
}

function assertSameSlot(design: NoteDesign, skin: NoteDesign, kind: string, slot: (d: NoteDesign) => Clip | undefined, label: string): void {
  const a = slot(design)
  const b = slot(skin)
  expect(a, `${kind}.${label} existence`).toBeDefined()
  expect(b, `${kind}.${label} existence`).toBeDefined()
  expect(b!.id, `${kind}.${label} id`).toBe(a!.id)
  expect(b!.mode, `${kind}.${label} mode`).toBe(a!.mode)
  expect(b!.duration, `${kind}.${label} duration`).toBe(a!.duration)
}

/* ------------------------------------------------------------------ */
/* sampling                                                            */

function slotsOf(d: NoteDesign): [string, Clip][] {
  const out: [string, Clip][] = [['enter', d.enter]]
  if (d.hold)
    out.push(['press', d.hold.press], ['loop', d.hold.loop], ['progress', d.hold.progress])
  for (const g of ['perfect', 'great', 'good', 'bad'] as const)
    out.push([`clear-${g}`, d.clear[g]])
  if (d.exit)
    out.push(['exit', d.exit])
  if (d.miss)
    out.push(['miss', d.miss])
  return out
}

const NORMALIZED_GRID = [
  0,
  1e-6,
  0.06,
  0.0799,
  0.08,
  0.081,
  0.1,
  0.12,
  0.2,
  0.25,
  0.3,
  0.32,
  0.35,
  0.3999,
  0.4,
  0.4001,
  0.42,
  0.4499,
  0.45,
  0.4501,
  0.5,
  0.6,
  0.6999,
  0.7,
  0.7001,
  0.745,
  0.75,
  0.8,
  0.8499,
  0.85,
  0.851,
  0.875,
  0.878,
  0.89,
  0.9,
  0.92,
  0.94,
  0.95,
  0.976,
  0.9989,
  0.999,
  0.9991,
  1,
]

function samplesFor(clip: Clip): number[] {
  switch (clip.mode) {
    case 'normalized':
      return NORMALIZED_GRID
    case 'progress':
      return [0, 1e-6, 0.05, 0.2, 0.4, 0.6, 0.74, 0.75, 0.76, 0.9, 0.999, 1]
    case 'once': {
      const d = clip.duration
      const out = [-0.01, 0, 1e-6]
      for (let i = 1; i < 40; i++) out.push((d * i) / 40)
      out.push(d * 0.999, d, d + 0.01)
      return out
    }
    case 'loop': {
      const d = clip.duration
      const out: number[] = [0, 1e-6]
      for (let i = 1; i <= 60; i++) out.push((d * i) / 20)
      return out
    }
    case 'static':
      return [0, 0.5, 3]
  }
}

/** contexts worth comparing: directions, approach windows (bracket landing + exit rewind), heading, palettes */
const VARIANT_PALETTE = createPalette({
  families: {
    'click': { up: 30, down: 200 },
    'hold': { up: 310, down: 40 },
    'long-hold': { up: 260, down: 10 },
    'flick': { up: 150, down: 150 },
    'drag': { up: 90, down: 90 },
    'click-drag': { up: 30, down: 200 },
    'drop-click': { up: 30, down: 200 },
    'drop-drag': { up: 90, down: 90 },
  },
  saturation: 0.8,
})

function contextsOf(kind: NoteKind): [string, DrawContext][] {
  const out: [string, DrawContext][] = [
    ['up', createContext(kind)],
    ['down', createContext(kind, { direction: 'down' })],
    ['fast', createContext(kind, { approach: 0.6 })],
    ['slow', createContext(kind, { approach: 2.4 })],
    ['pal-up', createContext(kind, { palette: VARIANT_PALETTE })],
    ['pal-down', createContext(kind, { palette: VARIANT_PALETTE, direction: 'down' })],
  ]
  if (kind === 'drag-head')
    out.push(['heading', createContext(kind, { heading: 0.7 })])
  return out
}

/* ------------------------------------------------------------------ */
/* the golden sweep                                                    */

describe('skin golden: compiled skin matches the imperative designs', () => {
  for (const kind of NOTE_KINDS) {
    it(`${kind}: slots agree on metadata`, () => {
      const a = slotsOf(imperative[kind])
      const b = slotsOf(compiled[kind])
      expect(b.map(([n]) => n), `${kind} slot set`).toEqual(a.map(([n]) => n))
      for (const [name] of a) {
        assertSameSlot(imperative[kind], compiled[kind], kind, d => slotsOf(d).find(([n]) => n === name)?.[1], name)
      }
    })

    for (const [ctxName, ctx] of contextsOf(kind)) {
      it(`${kind} @ ${ctxName}: every slot matches across the driver grid`, () => {
        for (const [slotName, clip] of slotsOf(imperative[kind])) {
          const skinClip = slotsOf(compiled[kind]).find(([n]) => n === slotName)![1]
          for (const x of samplesFor(clip)) {
            const a = clip.draw(x, ctx) as SceneNode
            const b = skinClip.draw(x, ctx) as SceneNode
            const err = compareTrees(a, b, `${kind}@${ctxName}.${slotName}(x=${x.toFixed(6)})`)
            expect(err, `${kind}@${ctxName}.${slotName}(x=${x.toFixed(6)})`).toBeNull()
          }
        }
      })
    }
  }
})

/* ------------------------------------------------------------------ */
/* schema / loader behaviour                                           */

describe('skin schema & validation', () => {
  it('accepts the shipped flat skin', () => {
    expect(() => parseSkin(flatSkinJson)).not.toThrow()
    expect(() => compileSkin(parseSkin(flatSkinJson))).not.toThrow()
  })

  it('rejects structurally invalid documents', () => {
    expect(() => parseSkin({})).toThrow()
    expect(() => parseSkin({ ...flatSkinJson, schemaVersion: 2 })).toThrow()
    const broken = structuredClone(flatSkinJson) as Record<string, unknown>
    ;(broken as { notes: Record<string, { enter: { layers: { type: string }[] } }> }).notes.click.enter.layers[0]!.type = 'spiral'
    expect(() => parseSkin(broken)).toThrow()
  })

  it('rejects the frames placeholder', () => {
    const doc: Skin = parseSkin(flatSkinJson)
    doc.notes.click.enter.frames = 'baked/click'
    expect(() => compileSkin(doc)).toThrow(/frames/)
  })

  it('rejects retimed slots (v1 durations are pinned to the engine)', () => {
    const doc: Skin = parseSkin(flatSkinJson)
    doc.notes.click.enter.duration = 2
    expect(() => compileSkin(doc)).toThrow(/duration/)
    const doc2: Skin = parseSkin(flatSkinJson)
    doc2.notes.click.exit!.alpha!.drop = 0.9
    expect(() => compileSkin(doc2)).toThrow(/exit/)
  })

  it('rejects unknown track and anchor references', () => {
    const doc: Skin = parseSkin(flatSkinJson)
    doc.notes.click.enter.root!.opacity = { track: 'nope' }
    const compiledBad = compileSkin(doc)
    expect(() => compiledBad.click.enter.draw(0.5, createContext('click'))).toThrow(/unknown track/)
    const doc2: Skin = parseSkin(flatSkinJson)
    doc2.notes.click.enter.root!.opacity = { anchor: 'nope' }
    const compiledBad2 = compileSkin(doc2)
    expect(() => compiledBad2.click.enter.draw(0.5, createContext('click'))).toThrow(/unknown anchor/)
  })
})
