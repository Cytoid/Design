import type { SceneNode } from '../core/scene'
import type { Palette } from '../palette'
import type { Direction, Grade, NoteKind } from '../tokens'
import type { Clip, DrawContext, NoteDesign, NoteState } from './types'
import { group } from '../core/scene'
import { defaultPalette } from '../palette'
import { loadFlatSkin } from '../skin'
import { tokens } from '../tokens'
import { judgementClips, judgementOffset } from './judgement'
import { exitAlpha } from './shared'
import { renderTiming, showsTiming } from './timing'

/**
 * The truth source: the shipped flat skin (a plain JSON document), validated
 * and compiled into drop-in designs by the TS reference interpreter. The
 * imperative draw code this table used to hold lives on as the golden oracle
 * in `test/golden/legacy`, which pins the interpreter to byte-identical trees.
 */
export const designs: Record<NoteKind, NoteDesign> = loadFlatSkin()

export interface ContextOptions {
  palette?: Palette
  direction?: Direction
  /** px per design px (1 → click note = 128 px) */
  scale?: number
  /** hold body direction, defaults to `direction` */
  bodyDirection?: Direction
  /** real approach window in seconds, defaults to the nominal enter duration */
  approach?: number
  /** drag-head arrow heading in radians (0 = up, clockwise); point it at the next chain node */
  heading?: number
}

export function createContext(kind: NoteKind, o: ContextOptions = {}): DrawContext {
  const palette = o.palette ?? defaultPalette
  const direction = o.direction ?? 'up'
  const scale = o.scale ?? 1
  return {
    kind,
    palette: palette.note(kind, direction),
    grades: palette.grade,
    direction,
    bodyDirection: o.bodyDirection ?? direction,
    approach: o.approach ?? tokens.time.enter,
    heading: o.heading ?? 0,
    unit: tokens.unit * scale,
    size: tokens.unit * tokens.size[kind] * scale,
  }
}

/** All frame clips of a design, flattened (enter, hold layers, clears, miss). */
export function clipsOf(design: NoteDesign): Clip[] {
  return [
    design.enter,
    ...(design.hold
      ? [
          design.hold.press,
          ...(design.hold.loopUnder ? [design.hold.loopUnder] : []),
          ...(design.hold.loopOver ? [design.hold.loopOver] : []),
          design.hold.progress,
        ]
      : []),
    design.clear.perfect,
    design.clear.great,
    design.clear.good,
    design.clear.bad,
    ...(design.exit ? [design.exit] : []),
    ...(design.miss ? [design.miss] : []),
  ]
}

export interface RenderOptions {
  /** draw the judgement text (PERFECT / GREAT / …) with clear & miss effects. Default true. */
  judgement?: boolean
  /**
   * draw the FAST / SLOW timing label when the clear state carries a `timing`
   * (GREAT / GOOD / BAD only). Independent of `judgement`: stacked under the
   * judgement text when both are on, alone in the centre otherwise. Default true.
   */
  timing?: boolean
}

/** Judgement text placed above the note (t = seconds since judgement). */
export function renderJudgement(grade: Grade, t: number, ctx: DrawContext): SceneNode {
  const o = judgementOffset(ctx)
  return group([judgementClips[grade].draw(t, ctx)], { transform: o })
}

/**
 * Composed vector renderer: one call per note per frame.
 * (Bodies / drag lines are separate — see `bodies.ts`.)
 */
export function renderNote(kind: NoteKind, state: NoteState, ctx: DrawContext = createContext(kind), options: RenderOptions = {}): SceneNode {
  const d = designs[kind]
  const text = options.judgement ?? true
  switch (state.phase) {
    case 'enter':
      return d.enter.draw(state.p, ctx)
    case 'holding': {
      if (!d.hold)
        return d.enter.draw(1, ctx)
      // layer order: looping layer under the body → head (press) → looping
      // layer over it → progress ring — a skin sandwiches the body freely
      return group([
        d.hold.loopUnder?.draw(state.t, ctx),
        d.hold.press.draw(state.t, ctx),
        d.hold.loopOver?.draw(state.t, ctx),
        d.hold.progress.draw(state.progress, ctx),
      ].filter(Boolean) as SceneNode[])
    }
    case 'clear': {
      const fx = d.clear[state.grade].draw(state.t, ctx)
      const layers = [fx]
      if (text)
        layers.push(renderJudgement(state.grade, state.t, ctx))
      if (state.timing && (options.timing ?? true) && showsTiming(state.grade))
        layers.push(renderTiming(state.timing, state.grade, state.t, ctx, text ? 'stacked' : 'centre'))
      return layers.length > 1 ? group(layers) : fx
    }
    case 'exit':
      return d.exit ? d.exit.draw(state.t, ctx) : d.enter.draw(1, ctx)
    case 'miss': {
      const fx = missBody(d, state, ctx)
      const layers = [fx, text ? renderJudgement('miss', state.t, ctx) : null].filter(Boolean) as SceneNode[]
      return layers.length === 1 ? layers[0]! : group(layers)
    }
  }
}

/**
 * Seconds past the chart hit time a miss rides the exit fade, or null when it
 * plays the design's own miss clip. A miss judged before the exit ran out
 * (deadline misses, dead-chain children judged ahead of their time) keeps the
 * exit timeline; one judged later — a hold released early, alive until then —
 * has no exit left to ride.
 */
export function missExitTime(d: NoteDesign, state: Extract<NoteState, { phase: 'miss' }>): number | null {
  const since = state.since ?? state.t
  // judged at the deadline (= the exit's end, Cytoid's miss threshold) still
  // counts as riding it; the epsilon absorbs float error in since − t
  if (!d.exit || (d.miss && since - state.t > d.exit.duration + 1e-3))
    return null
  return since
}

function missBody(d: NoteDesign, state: Extract<NoteState, { phase: 'miss' }>, ctx: DrawContext): SceneNode | null {
  const since = missExitTime(d, state)
  if (since == null)
    return d.miss?.draw(state.t, ctx) ?? null
  return since < d.exit!.duration ? d.exit!.draw(since, ctx) : null
}

/**
 * Hold body opacity for a note state: full while entering /
 * holding; on the exit (and a miss riding it) it fades on its own curve —
 * gone in half the head's window. 0 = don't draw the body.
 */
export function holdBodyAlpha(kind: NoteKind, state: NoteState): number {
  switch (state.phase) {
    case 'enter':
    case 'holding':
      return 1
    case 'exit':
      return exitAlpha(state.t, tokens.time.exit.holdBody)
    case 'miss': {
      const since = missExitTime(designs[kind], state)
      return since == null ? 0 : exitAlpha(since, tokens.time.exit.holdBody)
    }
    default:
      return 0
  }
}

export * from './bodies'
export * from './judgement'
export * from './timing'
export type * from './types'
