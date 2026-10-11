/**
 * Judgement effects. Flat language: one shock ring + a crisp sector ring +
 * square shards, all in the grade colour. Better grades = faster, bigger,
 * more pieces (Cytoid FlatFX speeds 1 / .9 / .7 / .5).
 */
import type { SceneNode } from '../core/scene'
import type { ClearGrade, Clip, DrawContext } from './types'
import { lerp, outCubic, outExpo, outQuad, outQuart, seg, TAU } from '../core/ease'
import { group } from '../core/scene'
import { tokens } from '../tokens'
import { arc, capsule, dashedRing, diamond, disk, flickChevron, ring, shards } from './parts'

export type EffectShape = 'circle' | 'diamond' | 'capsule'

export interface ClearFlavor {
  shape: EffectShape
  /** shock ring end radius, relative to note radius */
  reach: number
  /** number of sectors in the crisp outer ring (Cytoid: 24, flick 4) */
  sectors: number
  /** extra: horizontal streaks (flick), vertical beam (long hold), double ring (hold, click) */
  extra?: 'streaks' | 'beam' | 'double'
  /**
   * What the opening colour flash shows. 'note' (default): the note's own
   * steady shape — the thing that was hit. 'tail': a body-width disc — the
   * hold family plays its clear at the hold end, where there is no note to
   * flash; the disc is the release dot (lit white at progress 0.9–1)
   * detonating. Deliberately rotation-free so baked frames work for either
   * body direction.
   */
  flash?: 'note' | 'tail'
  seed: number
}

// Kept compact on purpose: dense charts stack many effects, large ones get noisy.
/**
 * Overall opacity multiplier for the clear/miss effects (the judgement text is unaffected) —
 *  the burst marks the hit without hiding the notes around it.
 */
export const EFFECT_ALPHA = 0.5
/** Flick swipe arrows per grade. */
const FLICK_ARROWS: Record<ClearGrade, number> = { perfect: 3, great: 2, good: 1, bad: 1 }

const GRADE_SCALE: Record<ClearGrade, { reach: number, shards: number, sector: boolean }> = {
  perfect: { reach: 1, shards: 6, sector: true },
  great: { reach: 0.9, shards: 4, sector: true },
  good: { reach: 0.75, shards: 3, sector: false },
  bad: { reach: 0.6, shards: 0, sector: false },
}

function outline(shape: EffectShape, r: number, width: number, color: string, ctx: DrawContext, opacity = 1): SceneNode {
  if (shape === 'diamond')
    return diamond(r, { stroke: color, strokeWidth: width, opacity })
  if (shape === 'capsule') {
    const ratio = r / (ctx.size / 2)
    const w = ctx.size * 1.15 * ratio
    const h = ctx.size * 0.3 * ratio
    return capsule(w + width, h + width, { stroke: color, strokeWidth: width, opacity })
  }
  return ring(r, width, color, opacity)
}

function solid(shape: EffectShape, r: number, color: string, ctx: DrawContext, opacity = 1): SceneNode {
  if (shape === 'diamond')
    return diamond(r, { fill: color, opacity })
  if (shape === 'capsule') {
    const ratio = r / (ctx.size / 2)
    return capsule(ctx.size * 1.15 * ratio, ctx.size * 0.3 * ratio, { fill: color, opacity })
  }
  return disk(r, color, opacity)
}

export function clearEffect(flavor: ClearFlavor, grade: ClearGrade, u: number, ctx: DrawContext): SceneNode {
  const R = ctx.size / 2
  const W = ctx.unit * tokens.stroke.ring
  const g = GRADE_SCALE[grade]
  const color = ctx.grades[grade]
  const shape = flavor.shape
  const reach = 1 + (flavor.reach - 1) * g.reach

  // 1. core flash: a faint grade-colour pop that collapses (no white, and peak
  // opacity only 0.25 — it marks the hit without pulling the eye). The hold
  // family flashes the release dot (body width) instead of a phantom note.
  const flashK = seg(u, 0, 0.32)
  const grow = lerp(1, 1.08, outCubic(flashK)) * (1 - outQuad(seg(u, 0.12, 0.32)))
  const flash = flavor.flash === 'tail'
    ? disk(ctx.unit * tokens.stroke.holdBody * grow, color, 0.25 * (1 - seg(u, 0.2, 0.32)))
    : solid(shape, R * grow, color, ctx, 0.25 * (1 - seg(u, 0.2, 0.32)))

  // 2. shock ring, thickness 1.333 → 0.333 (Cytoid FlatFX); peak opacity 0.5 —
  // a full-strength ring pulled the eye away from the notes around it
  const sk = outExpo(seg(u, 0, 0.85))
  const shock = outline(shape, R * lerp(0.95, reach, sk), W * lerp(1.6, 0.35, sk), color, ctx, 0.5 * (1 - outCubic(seg(u, 0.12, 0.8))))

  // 3. double ring (hold family)
  const second = flavor.extra === 'double'
    ? outline(shape, R * lerp(0.7, reach * 0.78, outQuart(seg(u, 0.08, 0.9))), W * lerp(0.9, 0.2, seg(u, 0.08, 0.9)), color, ctx, 1 - seg(u, 0.4, 0.95))
    : null

  // 4. crisp sector ring (perfect / great)
  let sectors: SceneNode | null = null
  if (g.sector && shape !== 'capsule') {
    const k = outQuart(seg(u, 0.05, 1))
    const duty = lerp(0.62, 0.12, k)
    const r = R * lerp(reach * 0.8, reach * 1.02, k)
    sectors = flavor.sectors <= 4
      ? group(Array.from({ length: 4 }, (_, i) => {
          const c = i * (TAU / 4) + TAU / 8 + (shape === 'diamond' ? 0 : 0)
          return arc(r, c - 0.42 * duty * 1.6, c + 0.42 * duty * 1.6, W * 0.45, color)
        }), { opacity: 1 - seg(u, 0.55, 1) })
      : dashedRing(r, W * lerp(0.55, 0.25, k), color, flavor.sectors, duty, k * 0.35, 1 - seg(u, 0.55, 1))
  }

  // 5. shards
  const pieces = g.shards > 0
    ? shards({
        count: g.shards + (flavor.extra === 'double' || flavor.extra === 'beam' ? 4 : 0),
        seed: flavor.seed * 31 + g.shards,
        r0: R * 0.8,
        r1: R * reach * 1.12,
        size: ctx.unit * 0.06,
        color: grade === 'perfect' ? '#FFFFFF' : color,
        u: seg(u, 0.02, 1),
        sectors: flavor.extra === 'streaks' ? [[TAU / 4 - 0.5, TAU / 4 + 0.5], [TAU * 0.75 - 0.5, TAU * 0.75 + 0.5]] : undefined,
      })
    : null

  // 6. extras
  let extra: SceneNode | null = null
  if (flavor.extra === 'streaks') {
    const k = outQuart(seg(u, 0, 0.7))
    const len = R * lerp(0.3, 1.2, k)
    const off = R * lerp(0.9, 1.25, k)
    const th = W * lerp(0.8, 0.15, k)
    const op = 1 - seg(u, 0.35, 0.8)
    const streaks = group([
      { type: 'rect', x: off, y: -th / 2, w: len, h: th, fill: color },
      { type: 'rect', x: -off - len, y: -th / 2, w: len, h: th, fill: color },
    ], { opacity: op })
    // swipe direction: 1–3 big, faint, wide chevrons sweep to the right
    // (baked pointing right — rotate the whole effect for other swipe directions)
    const n = FLICK_ARROWS[grade]
    const arrows: SceneNode[] = []
    for (let i = 0; i < n; i++) {
      const ka = seg(u, i * 0.08, 0.7 + i * 0.08)
      if (ka <= 0 || ka >= 1)
        continue
      const x = R * lerp(0.2, 1.5 - i * 0.42, outQuart(ka))
      // fixed size, stroke and 90° angle (same as the note's chevrons) for the whole animation
      // about as tall as the flick's centre slit
      arrows.push(flickChevron(x, R * 0.38, W * 1.1, color, 0.42 * seg(ka, 0, 0.15) * (1 - seg(ka, 0.45, 1)) * (1 - i * 0.18)))
    }
    extra = group([streaks, ...arrows])
  }
  else if (flavor.extra === 'beam') {
    const k = outCubic(seg(u, 0, 0.6))
    const h = R * lerp(1, 3, k)
    const w = W * lerp(1.4, 0.2, k)
    extra = { type: 'rect', x: -w / 2, y: -h, w, h: h * 2, fill: color, opacity: 0.85 * (1 - seg(u, 0.25, 0.75)) }
  }

  // flick arrows sit on top (they carry the swipe direction); the long-hold beam sits underneath
  return flavor.extra === 'streaks'
    ? group([shock, second, sectors, flash, pieces, extra], { opacity: EFFECT_ALPHA })
    : group([extra, shock, second, sectors, flash, pieces], { opacity: EFFECT_ALPHA })
}

export function missEffect(shape: EffectShape, u: number, ctx: DrawContext, ghost?: (ctx: DrawContext, R: number, W: number, k: number) => SceneNode[]): SceneNode {
  const R = ctx.size / 2
  const W = ctx.unit * tokens.stroke.ring
  const gray = ctx.grades.miss
  const k = outCubic(u)
  const op = 1 - seg(u, 0.25, 1)
  // the note "powers down": fill drains to a dim ghost, outline shrinks and sinks.
  // Notes whose steady pose differs structurally (drag child: no outer ring) pass
  // their own ghost so the sinking note is still *their* end pose.
  const parts = ghost
    ? ghost(ctx, R, W, k)
    : [
        solid(shape, R * lerp(0.92, 0.75, k), ctx.palette[800], ctx, 0.9),
        outline(shape, R * lerp(1, 0.78, k) - W / 2, W * lerp(1, 0.6, k), gray, ctx),
      ]
  // no cross: the MISS judgement text carries the meaning
  return group(parts, { opacity: EFFECT_ALPHA * op, transform: { y: lerp(0, ctx.unit * 0.08, k) } })
}

export function makeClearClips(flavor: ClearFlavor): Record<ClearGrade, Clip> {
  const mk = (grade: ClearGrade): Clip => ({
    id: `clear-${grade}`,
    mode: 'once',
    duration: tokens.time.clear[grade],
    draw: (t, ctx) => clearEffect(flavor, grade, t / tokens.time.clear[grade], ctx),
  })
  return { perfect: mk('perfect'), great: mk('great'), good: mk('good'), bad: mk('bad') }
}

export function makeMissClip(shape: EffectShape, ghost?: (ctx: DrawContext, R: number, W: number, k: number) => SceneNode[]): Clip {
  return {
    id: 'miss',
    mode: 'once',
    duration: tokens.time.clear.miss,
    draw: (t, ctx) => missEffect(shape, t / tokens.time.clear.miss, ctx, ghost),
  }
}
