import type { SceneNode } from '../core/scene'
import type { Palette } from '../palette'
import type { Direction, Grade, NoteKind } from '../tokens'
import type { Clip, DrawContext, NoteDesign, NoteState } from './types'
import { group } from '../core/scene'
import { defaultPalette } from '../palette'
import { tokens } from '../tokens'
import { click, clickDragHead } from './click'
import { clickDragChild, dragChild, dragHead } from './drag'
import { dropClick, dropDrag } from './drop'
import { flick } from './flick'
import { hold, longHold } from './hold'
import { judgementClips, judgementOffset } from './judgement'

export const designs: Record<NoteKind, NoteDesign> = {
  'click': click,
  'hold': hold,
  'long-hold': longHold,
  'drag-head': dragHead,
  'drag-child': dragChild,
  'flick': flick,
  'click-drag-head': clickDragHead,
  'click-drag-child': clickDragChild,
  'drop-click': dropClick,
  'drop-drag': dropDrag,
}

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
    ...(design.hold ? [design.hold.press, design.hold.loop, design.hold.progress] : []),
    design.clear.perfect,
    design.clear.great,
    design.clear.good,
    design.clear.bad,
    design.miss,
  ]
}

export interface RenderOptions {
  /** draw the judgement text (PERFECT / GREAT / …) with clear & miss effects. Default true. */
  judgement?: boolean
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
      // layer order: head (press) → loop (inside the head) → progress ring
      return group([
        d.hold.press.draw(state.t, ctx),
        d.hold.loop.draw(state.t, ctx),
        d.hold.progress.draw(state.progress, ctx),
      ])
    }
    case 'clear': {
      const fx = d.clear[state.grade].draw(state.t, ctx)
      return text ? group([fx, renderJudgement(state.grade, state.t, ctx)]) : fx
    }
    case 'miss': {
      const fx = d.miss.draw(state.t, ctx)
      return text ? group([fx, renderJudgement('miss', state.t, ctx)]) : fx
    }
  }
}

export * from './bodies'
export * from './judgement'
export type * from './types'
