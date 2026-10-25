import type { SceneNode } from '../core/scene'
import type { Grade, NoteKind } from '../tokens'
import type { Timing } from './timing'
import type { Clip, DrawContext, NoteDesign, NoteSkin, NoteState, RenderOptions } from './types'
import { group } from '../core/scene'
import { showsTiming } from './timing'

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

export function missExitTime(d: NoteDesign, state: Extract<NoteState, { phase: 'miss' }>): number | null {
  const since = state.since ?? state.t
  // judged at the deadline (= the exit's end, Cytoid's miss threshold) still
  // counts as riding it; the epsilon absorbs float error in since − t
  if (!d.exit || (d.miss && since - state.t > d.exit.duration + 1e-3))
    return null
  return since
}

export * from './timing'
export type * from './types'

/** Select exactly one feedback animation from the user's display settings. */
export function renderFeedback(grade: Grade, timing: Timing | undefined, t: number, ctx: DrawContext, skin: NoteSkin, options: Pick<RenderOptions, 'judgement' | 'timing'> = {}): SceneNode | null {
  const text = options.judgement ?? true
  if ((options.timing ?? true) && timing !== undefined && showsTiming(grade))
    return (text ? skin.feedback.combined : skin.feedback.timing)[grade][timing].draw(t, ctx)
  return text ? skin.feedback.judgement[grade].draw(t, ctx) : null
}

export function composeNote(kind: NoteKind, state: NoteState, ctx: DrawContext, skin: NoteSkin, options: Pick<RenderOptions, 'judgement' | 'timing'> = {}): SceneNode {
  const d = skin[kind]
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
      const feedback = renderFeedback(state.grade, state.timing, state.t, ctx, skin, options)
      return feedback ? group([fx, feedback]) : fx
    }
    case 'exit':
      return d.exit ? d.exit.draw(state.t, ctx) : d.enter.draw(1, ctx)
    case 'miss': {
      const fx = missBody(d, state, ctx)
      const result = [fx, renderFeedback('miss', undefined, state.t, ctx, skin, options)].filter(Boolean) as SceneNode[]
      return result.length === 1 ? result[0]! : group(result)
    }
  }
}

function missBody(d: NoteDesign, state: Extract<NoteState, { phase: 'miss' }>, ctx: DrawContext): SceneNode | null {
  const since = missExitTime(d, state)
  if (since == null)
    return d.miss?.draw(state.t, ctx) ?? null
  return since < d.exit!.duration ? d.exit!.draw(since, ctx) : null
}
