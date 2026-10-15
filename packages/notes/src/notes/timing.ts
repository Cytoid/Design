/**
 * Timing label — FAST / SLOW (Cytoid "Early / Late indicators").
 *
 * Cytoid used to print EARLY / LATE in the middle of the clear effect. That
 * slot now belongs to the judgement text, so the timing label becomes its
 * own, independently toggled layer:
 *
 *  - Shown only when the hit has a meaningful timing error: GREAT / GOOD /
 *    BAD. PERFECT and MISS never carry one (Cytoid rule). Auto-cleared drag
 *    children are always PERFECT, so they never show it either.
 *  - Two slots, picked by the judgement-text setting (a setting, never a
 *    per-hit decision — the label never jumps during play):
 *      `stacked`  judgement text on: a smaller second line just under the
 *                 judgement underline, inside the effect.
 *      `centre`   judgement text off: the label takes the vacated centre —
 *                 the position Cytoid's EARLY / LATE always had.
 *  - Same chamfered monoline face as the judgement (no font files), cap
 *    height 0.6 × the judgement's, slightly heavier stroke so it survives
 *    the smaller size.
 *  - Colour: the grade colour lifted toward white — tied to the judgement it
 *    explains, and no new hue competes with the grade palette (blue / yellow
 *    / green / red are all taken; a "blue = fast, red = slow" scheme would
 *    read as PERFECT / BAD).
 *  - Direction is carried by shape and motion, not colour — the horizontal
 *    axis is time: FAST gets a ‹ chevron on its left and slides in leftward
 *    (ahead of the beat), SLOW gets a › chevron on its right and slides in
 *    rightward (behind it). Readable in peripheral vision without parsing
 *    the word.
 *
 * Motion (u = t / grade clear duration — exactly the judgement's window):
 *  0.06–0.40  slides 0.5 H in along its direction (outCubic) and pops in
 *  0.00–1.00  rises with the judgement text (0.12 judgement H)
 *  0.70–1.00  fade out
 */
import type { SceneNode } from '../core/scene'
import type { Grade } from '../tokens'
import type { ClearGrade, Clip, DrawContext } from './types'
import { mix } from '../core/color'
import { lerp, outBack, outCubic, seg } from '../core/ease'
import { group } from '../core/scene'
import { tokens } from '../tokens'
import { drawText, judgementCapHeight, measureText } from './judgement'

export const TIMINGS = ['fast', 'slow'] as const
export type Timing = typeof TIMINGS[number]

export const TIMING_TEXT: Record<Timing, string> = { fast: 'FAST', slow: 'SLOW' }

/** Grades that carry a timing label. */
export const TIMED_GRADES = ['great', 'good', 'bad'] as const satisfies readonly ClearGrade[]
export type TimedGrade = typeof TIMED_GRADES[number]

export function showsTiming(grade: Grade): grade is TimedGrade {
  return (TIMED_GRADES as readonly Grade[]).includes(grade)
}

/** FAST / SLOW from a signed timing error (press time − chart time, seconds). */
export function timingOf(error: number): Timing {
  return error < 0 ? 'fast' : 'slow'
}

/** Where the label sits: under the judgement text, or alone in the centre. */
export type TimingSlot = 'stacked' | 'centre'

/** Cap height in px: 0.6 × the judgement text. */
export const timingCapHeight = (ctx: DrawContext) => judgementCapHeight(ctx) * 0.6

/** Label centre relative to the note centre. */
export function timingOffset(ctx: DrawContext, slot: TimingSlot): { x: number, y: number } {
  if (slot === 'centre')
    return { x: 0, y: 0 }
  // judgement underline bottom (0.88 Hj) + a 0.3 Hj gap + half the label
  const Hj = judgementCapHeight(ctx)
  return { x: 0, y: Hj * 1.18 + timingCapHeight(ctx) / 2 }
}

/** Static label around its own centre (no animation). */
export function drawTimingLabel(timing: Timing, H: number, color: string, pop?: (i: number) => number): SceneNode {
  const text = TIMING_TEXT[timing]
  const sw = H * 0.22
  const textW = measureText(text, H)
  const chevW = H * 0.34
  const gap = H * 0.72
  const total = textW + gap + chevW
  const fast = timing === 'fast'
  // chevron on the leading side: ‹ before FAST, › after SLOW
  const cx = fast ? -total / 2 + chevW / 2 : total / 2 - chevW / 2
  const tx = fast ? total / 2 - textW / 2 : -total / 2 + textW / 2
  const tip = fast ? -chevW / 2 : chevW / 2
  const chevron: SceneNode = {
    type: 'poly',
    points: [[cx - tip, -H * 0.4], [cx + tip, 0], [cx - tip, H * 0.4]],
    stroke: color,
    strokeWidth: sw,
    join: 'miter',
    cap: 'square',
  }
  return group([chevron, group([drawText(text, H, color, { stroke: sw, pop })], { transform: { x: tx } })])
}

/** Colour of the label for a grade: the grade colour lifted toward white. */
export function timingColor(grade: TimedGrade, ctx: DrawContext): string {
  return mix(ctx.grades[grade], '#FFFFFF', 0.45)
}

/** One animated frame around the label centre (t = seconds since judgement). */
export function drawTiming(timing: Timing, grade: TimedGrade, t: number, ctx: DrawContext): SceneNode {
  const u = t / tokens.time.clear[grade]
  const H = timingCapHeight(ctx)
  const dir = timing === 'fast' ? -1 : 1
  const k = outCubic(seg(u, 0.06, 0.4))
  const pop = (i: number) => outBack(seg(u, 0.06 + i * 0.03, 0.24 + i * 0.03), 1.6)
  const dx = dir * H * 0.5 * (k - 1)
  const dy = -judgementCapHeight(ctx) * 0.12 * outCubic(u)
  const body = drawTimingLabel(timing, H, timingColor(grade, ctx), pop)
  return group([body], { opacity: lerp(0, 1, seg(u, 0.06, 0.2)) * (1 - seg(u, 0.7, 1)), transform: { x: dx, y: dy } })
}

/** Placed label (t = seconds since judgement). */
export function renderTiming(timing: Timing, grade: TimedGrade, t: number, ctx: DrawContext, slot: TimingSlot): SceneNode {
  return group([drawTiming(timing, grade, t, ctx)], { transform: timingOffset(ctx, slot) })
}

/** One clip per timed grade × timing, drawn around the label centre. */
export const timingClips: Record<TimedGrade, Record<Timing, Clip>> = Object.fromEntries(TIMED_GRADES.map(g => [g, {
  fast: clip(g, 'fast'),
  slow: clip(g, 'slow'),
}])) as Record<TimedGrade, Record<Timing, Clip>>

function clip(grade: TimedGrade, timing: Timing): Clip {
  return {
    id: `timing-${grade}-${timing}`,
    mode: 'once',
    duration: tokens.time.clear[grade],
    draw: (t, ctx) => drawTiming(timing, grade, t, ctx),
    note: `“${TIMING_TEXT[timing]}” under ${grade.toUpperCase()} — chevron points along the time axis; drawn around the label centre.`,
  }
}
