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
 *  - Same chamfered monoline face as the judgement (no font files), with a
 *    slightly heavier stroke. Two sizes: alone in the centre it takes the
 *    judgement's full cap height — the slot Cytoid's EARLY / LATE always
 *    had; stacked under the judgement text it shrinks to 0.6 × so it stays
 *    a second line, not a rival. Stroke and chevron scale with the cap
 *    height.
 *  - Colour (experiment): fixed per direction, not per grade — red = FAST,
 *    green = SLOW, so direction reads by colour alone at a glance. The base
 *    design ties the colour to the grade it explains (every hue is taken by
 *    the grade palette); this variant trades that tie for the instant read,
 *    at full strength like the judgement text.
 *  - Direction is carried by shape and motion, not colour — the horizontal
 *    axis is time: FAST gets a ‹ chevron on its left and slides in leftward
 *    (ahead of the beat), SLOW gets a › chevron on its right and slides in
 *    rightward (behind it). Readable in peripheral vision without parsing
 *    the word.
 *
 * Motion (u = t / grade clear duration — exactly the judgement's window):
 *  0.06–0.40  slides 0.5 H in along its direction (outCubic) and pops in
 *  0.00–1.00  rises with the judgement text (0.12 judgement H)
 *  0.45–0.75  fade out — same window as the judgement text, so the two
 *             layers leave together
 */
import type { SceneNode } from '../core/scene'
import type { Grade } from '../tokens'
import type { ClearGrade, Clip, DrawContext } from './types'
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

/** Cap height in px: the judgement's full size alone in the centre, 0.6 × stacked under it. */
export function timingCapHeight(ctx: DrawContext, slot: TimingSlot): number {
  return judgementCapHeight(ctx) * (slot === 'centre' ? 1 : 0.6)
}

/** Label centre relative to the note centre. */
export function timingOffset(ctx: DrawContext, slot: TimingSlot): { x: number, y: number } {
  if (slot === 'centre')
    return { x: 0, y: 0 }
  // judgement underline bottom (0.88 Hj) + a 0.3 Hj gap + half the label
  const Hj = judgementCapHeight(ctx)
  return { x: 0, y: Hj * 1.18 + timingCapHeight(ctx, 'stacked') / 2 }
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

/**
 * Fixed label colours (experiment): red = FAST, green = SLOW, independent of
 * the grade. The bases are the grade palette's own red / green hues, at full
 * strength — the same treatment the judgement text gets — so the direction
 * read is as strong as this scheme can be.
 */
export const TIMING_COLOR: Record<Timing, string> = {
  fast: tokens.grade.bad,
  slow: tokens.grade.good,
}

/** One animated frame around the label centre (t = seconds since judgement). */
export function drawTiming(timing: Timing, grade: TimedGrade, t: number, ctx: DrawContext, slot: TimingSlot): SceneNode {
  const u = t / tokens.time.clear[grade]
  const H = timingCapHeight(ctx, slot)
  const dir = timing === 'fast' ? -1 : 1
  const k = outCubic(seg(u, 0.06, 0.4))
  const pop = (i: number) => outBack(seg(u, 0.06 + i * 0.03, 0.24 + i * 0.03), 1.6)
  const dx = dir * H * 0.5 * (k - 1)
  const dy = -judgementCapHeight(ctx) * 0.12 * outCubic(u)
  const body = drawTimingLabel(timing, H, TIMING_COLOR[timing], pop)
  return group([body], { opacity: lerp(0, 1, seg(u, 0.06, 0.2)) * (1 - seg(u, 0.45, 0.75)), transform: { x: dx, y: dy } })
}

/** Placed label (t = seconds since judgement). */
export function renderTiming(timing: Timing, grade: TimedGrade, t: number, ctx: DrawContext, slot: TimingSlot): SceneNode {
  return group([drawTiming(timing, grade, t, ctx, slot)], { transform: timingOffset(ctx, slot) })
}

/**
 * One clip per timed grade × timing, drawn around the label centre. Baked at
 * the centre (full) size — the larger of the two slots — so consumers shrink
 * it to 0.6 for the stacked slot (see the bake manifest's `timing.scale`).
 */
export const timingClips: Record<TimedGrade, Record<Timing, Clip>> = Object.fromEntries(TIMED_GRADES.map(g => [g, {
  fast: clip(g, 'fast'),
  slow: clip(g, 'slow'),
}])) as Record<TimedGrade, Record<Timing, Clip>>

function clip(grade: TimedGrade, timing: Timing): Clip {
  return {
    id: `timing-${grade}-${timing}`,
    mode: 'once',
    duration: tokens.time.clear[grade],
    draw: (t, ctx) => drawTiming(timing, grade, t, ctx, 'centre'),
    note: `“${TIMING_TEXT[timing]}” under ${grade.toUpperCase()} — chevron points along the time axis; drawn around the label centre.`,
  }
}
