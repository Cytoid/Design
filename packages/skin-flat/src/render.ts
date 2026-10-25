import type { ContextOptions, DrawContext, Grade, NoteDesign, NoteKind, NoteSkin, NoteState, RenderOptions, SceneNode } from '@cytoid/notes'
import { composeNote, group, missExitTime } from '@cytoid/notes'
import { judgementClips, judgementOffset } from './judgement'
import { defaultPalette } from './palette'
import { exitAlpha } from './shared'
import { loadFlatSkin } from './skin'
import { renderTiming } from './timing'
import { tokens } from './tokens'

/**
 * The truth source: the shipped v2 flat skin (frames → animations → slots), validated
 * and compiled into drop-in designs by the TS reference interpreter. The
 * imperative draw code this table used to hold lives on as the golden oracle
 * in `test/golden/reference`, which pins the interpreter to byte-identical trees.
 */
export const designs: Record<NoteKind, NoteDesign> = loadFlatSkin()

export function createContext(kind: NoteKind, o: ContextOptions = {}): DrawContext {
  const palette = o.palette ?? defaultPalette
  const direction = o.direction ?? 'up'
  const scale = o.scale ?? 1
  return {
    kind,
    ringStroke: tokens.unit * scale * tokens.stroke.ring,
    hairStroke: tokens.unit * scale * tokens.stroke.hair,
    palette: palette.note(kind, direction),
    grades: palette.grade,
    colors: palette,
    direction,
    bodyDirection: o.bodyDirection ?? direction,
    approach: o.approach ?? tokens.time.enter,
    heading: o.heading ?? 0,
    unit: tokens.unit * scale,
    size: tokens.unit * tokens.size[kind] * scale,
  }
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
  const text = options.judgement ?? true
  return composeNote(kind, state, ctx, options.skin ?? designs, {
    judgement: text ? renderJudgement : undefined,
    timing: (options.timing ?? true)
      ? (timing, grade, t, context) => renderTiming(timing, grade, t, context, text ? 'stacked' : 'centre')
      : undefined,
  })
}

/**
 * Hold body opacity for a note state: full while entering /
 * holding; on the exit (and a miss riding it) it fades on its own curve —
 * gone in half the head's window. 0 = don't draw the body.
 */
export function holdBodyAlpha(kind: NoteKind, state: NoteState, skin: NoteSkin = designs): number {
  switch (state.phase) {
    case 'enter':
    case 'holding':
      return 1
    case 'exit':
      return exitAlpha(state.t, tokens.time.exit.holdBody)
    case 'miss': {
      const since = missExitTime(skin[kind], state)
      return since == null ? 0 : exitAlpha(since, tokens.time.exit.holdBody)
    }
    default:
      return 0
  }
}
