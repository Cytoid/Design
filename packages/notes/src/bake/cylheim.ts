/**
 * Cylheim compat targets: same file names and frame numbers as the assets
 * Cylheim loads from `src/images/designer` (see
 * `pixi-runtime-note-animation-provider.ts` / `pixi-runtime-judgment-effect-provider.ts`).
 *
 * Cylheim plays a *timeline* of frame numbers (some repeated; enter 30 fps,
 * hit effects 51 fps). To
 * keep our motion timing exact, each unique frame number is sampled at the
 * moment Cylheim first shows it.
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteSkin } from '../notes/types'
import type { Direction, NoteKind } from '../tokens'
import { designs as defaultDesigns, judgementClips } from '../notes'
import { tokens } from '../tokens'

export interface CylheimTarget {
  pattern: string
  kind: NoteKind
  direction?: Direction
  /** frame numbers in display order (Cylheim's timeline) */
  timeline: number[]
  /** clip parameter for frame number `f` */
  sample: (f: number, timeline: number[]) => number
  draw: (x: number, ctx: DrawContext) => SceneNode
  /**
   * Cylheim's own display multiplier for this sprite (pixi-playback-note-layer
   * PLAYBACK_NOTE_SCALE_BY_KIND). We bake at `pxPerUnit / displayScale` so the
   * on-screen size matches our design.
   */
  displayScale?: number
  /** frame numbers Cylheim preloads but this timeline does not show (grouped popups) */
  extraFrames?: number[]
  note?: string
}

/** Cylheim's click art: ~174 px opaque diameter at display scale 1 → our 128 px unit. */
export const CYLHEIM_PX_PER_UNIT = 174 / 128

/** Every frame number to write, with its clip parameter (extra frames are interpolated by number). */
export function cylheimSamples(t: CylheimTarget): { f: number, x: number }[] {
  const shown = [...new Set(t.timeline)].map(f => ({ f, x: t.sample(f, t.timeline) }))
  const extra = (t.extraFrames ?? []).filter(f => !t.timeline.includes(f)).map((f) => {
    const lo = shown.filter(s => s.f < f).at(-1) ?? shown[0]!
    const hi = shown.find(s => s.f > f) ?? shown.at(-1)!
    const k = hi.f === lo.f ? 0 : (f - lo.f) / (hi.f - lo.f)
    return { f, x: lo.x + (hi.x - lo.x) * k }
  })
  return [...shown, ...extra].sort((a, b) => a.f - b.f)
}

const range = (a: number, b: number, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step)
const twice = (a: number, b: number) => range(a, b).flatMap(f => [f, f])
/** Cylheim hit effects: 51 fps, first `single` frames once, the rest twice (applyHitEffectFrameTiming). */
const hitTiming = (a: number, b: number, single: number) => range(a, b).flatMap((f, i) => (i < single ? [f] : [f, f]))

/** enter: normalised p at the first display slot of `f` (window ends at hit). */
const enterAt = (f: number, tl: number[]) => (tl.indexOf(f) + 1) / tl.length
/** effects: spread the clip over the display slots (repeats included) */
function spread(duration: number) {
  return (f: number, tl: number[]) => {
    const u = tl.indexOf(f) / Math.max(1, tl.length - 1)
    return u * duration
  }
}

export function createCylheimTargets(designs: NoteSkin = defaultDesigns): CylheimTarget[] {
  const enter = (kind: NoteKind) => designs[kind].enter.draw

  return [
    { pattern: 'Note-Click-Enter-Textures-Click_in_{frame}.png', kind: 'click', timeline: range(1, 41), sample: enterAt, draw: enter('click') },
    { pattern: 'Note-Hold-Enter-Textures-Hold_Note-Hold_in_{frame}.png', kind: 'hold', timeline: [...twice(1, 8), ...range(9, 24), ...range(26, 40, 2)], extraFrames: range(17, 40), sample: enterAt, draw: enter('hold'), displayScale: 0.83, note: 'Odd frames 25–39 are only used by the grouped-popup provider; interpolated.' },
    { pattern: 'Note-LongHold-Enter-Textures-LongHold_in-LongHold_in_{frame}.png', kind: 'long-hold', timeline: [0, 0, 0, ...twice(1, 8), ...range(9, 40)], sample: enterAt, draw: enter('long-hold'), displayScale: 0.83 },
    { pattern: 'Note-Drag-Enter-Textures-Drag_in_{frame}.png', kind: 'drag-head', timeline: range(1, 47), sample: enterAt, draw: enter('drag-head'), displayScale: 0.8 },
    { pattern: 'Note-DragChild-Textures-DragChild_in_{frame}.png', kind: 'drag-child', timeline: range(1, 47), sample: enterAt, draw: enter('drag-child'), displayScale: 0.42 },
    { pattern: 'Note-Flick-Enter-Textures-Flick_in_{frame}.png', kind: 'flick', timeline: [...twice(0, 6), ...range(7, 41)], sample: enterAt, draw: enter('flick'), displayScale: 0.8 },

    // drop notes are single static images in Cylheim (134 px wide original art → match its width)
    { pattern: 'Note-DropClick.png', kind: 'drop-click', timeline: [0], sample: () => 1, draw: designs['drop-click'].enter.draw, displayScale: (1.15 * 128 * CYLHEIM_PX_PER_UNIT) / 134 },
    { pattern: 'Note-DropDrag.png', kind: 'drop-drag', timeline: [0], sample: () => 1, draw: designs['drop-drag'].enter.draw, displayScale: (1.15 * 128 * CYLHEIM_PX_PER_UNIT) / 134 },

    { pattern: 'Note-Click-Bloom-Textures-Click_Boom_{frame}.png', kind: 'click', timeline: hitTiming(41, 50, 3), sample: spread(tokens.time.clear.perfect), draw: designs.click.clear.perfect.draw },
    { pattern: 'Note-Drag-Bloom-Textures-Drag_Boom_{frame}.png', kind: 'drag-head', timeline: hitTiming(41, 50, 3), sample: spread(tokens.time.clear.perfect), draw: designs['drag-head'].clear.perfect.draw },
    { pattern: 'Note-Flick-Bloom-Textures-Flick_BoomR_{frame}.png', kind: 'flick', timeline: hitTiming(41, 59, 4), sample: spread(tokens.time.clear.perfect), draw: designs.flick.clear.perfect.draw },
    { pattern: 'Note-Hold-Bloom-Textures-Hold_Boom_{frame}.png', kind: 'hold', timeline: hitTiming(57, 74, 4), sample: spread(tokens.time.clear.perfect), draw: designs.hold.clear.perfect.draw },
    { pattern: 'Note-LongHold-Bloom-Textures-LongHold_Boom_{frame}.png', kind: 'long-hold', timeline: hitTiming(58, 75, 3), sample: spread(tokens.time.clear.perfect), draw: designs['long-hold'].clear.perfect.draw },

    // hit text (pixi-runtime-judgment-effect-provider: 13 frames, 30 fps), centred on the text
    { pattern: 'PERFECT_Gold_top_{frame}.png', kind: 'click', timeline: range(146, 158), sample: spread(tokens.time.clear.perfect), draw: judgementClips.perfect.draw, note: 'Our text is centred; Cylheim positions its own hit text.' },

    { pattern: 'Note-Hold-Holding-Textures-Hold_Button_in-Hold_Button_in_{frame}.png', kind: 'hold', timeline: range(41, 49), sample: spread(tokens.time.holdPress), draw: designs.hold.hold?.press.draw ?? ((_x, ctx) => designs.hold.enter.draw(1, ctx)), note: 'Cylheim loops this sequence; our press settles on its last frame.' },
    { pattern: 'Note-LongHold-Holding-Textures-LongHold_Button_in-LongHold_Button_in_{frame}.png', kind: 'long-hold', timeline: range(41, 57), sample: spread(tokens.time.holdPress), draw: designs['long-hold'].hold?.press.draw ?? ((_x, ctx) => designs['long-hold'].enter.draw(1, ctx)) },
  // Hold_Fire (hold + long hold): the flat skin has no looping clip — while
  // held, classic's holdFx particles carry the motion (C# phase-1 scope), so
  // there is nothing vector-baked to export for those frames.
  ]
}

export const CYLHEIM_TARGETS = createCylheimTargets()
