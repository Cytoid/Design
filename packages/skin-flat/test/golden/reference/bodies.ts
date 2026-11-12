import type { DrawContext, HoldBodyOptions, LongHoldBodyOptions, SceneNode } from '@cytoid/notes'
/**
 * Stretched elements: hold body, long-hold body, drag connection line.
 * These depend on chart geometry, so they are parametric vector parts.
 * For frame consumers they are baked as tileable strips (see bake).
 */

import { clamp01, group, inSine, lerp, outCubic, seg } from '@cytoid/notes'
import { tokens } from '../../../src/tokens'

/**
 * Body entrance, keyed on the head's enter progress (`appear`): the body
 * fades in while it stretches the last 20 % of its length — from
 * `BODY_REVEAL.from` × to full — over one short window once the head is mostly
 * built. A full 0 → 1 unroll read as a slow crawl; this keeps a hint of
 * motion and lands the body early.
 */
export const BODY_REVEAL = { start: 0.08, end: 0.35, fadeEnd: 0.22, from: 0.8 }

/** Length factor (BODY_REVEAL.from → 1) and opacity (0 → 1) of the body at `appear`. */
export function bodyReveal(appear: number): { stretch: number, alpha: number } {
  const { start, end, fadeEnd, from } = BODY_REVEAL
  return {
    stretch: lerp(from, 1, outCubic(seg(appear, start, end))),
    alpha: seg(appear, start, fadeEnd),
  }
}

/** Integer dash period of the hold body conveyor (= tile height of the baked strip). */
export function holdDashPeriod(ctx: DrawContext): number {
  return Math.max(2, Math.round(ctx.unit * tokens.stroke.holdBody * 1.1))
}

/**
 * Hold body in note-local space. Extends toward -y for `up`, +y for `down`.
 *
 * No end piece: the body is cut flat at the hold end — no rounded cap, no
 * release dot. (User feedback: every note detonates when its centre meets the
 * scanline, but the old rounded tail read as a small circle the line only
 * touched tangentially. Neither reference design has a tail either.) The
 * flat edge sits exactly on the end point, so it meets the scanline the
 * moment the hold completes.
 *
 * Two thin side rails run along the body — unclipped, so their full hair
 * width reads (the long-hold edge-rail recipe; user feedback: the empty
 * track's length was too faint). The far end stays open: no cap line across
 * it. The fill later covers the rails' inner half in the same colour,
 * leaving them to rim the filled bar.
 */
export function holdBody(o: HoldBodyOptions, ctx: DrawContext): SceneNode {
  const s = ctx.bodyDirection === 'up' ? -1 : 1
  const Wb = ctx.unit * tokens.stroke.holdBody
  const hair = ctx.unit * tokens.stroke.hair
  const L = Math.max(0, o.length)
  const appear = clamp01(o.appear ?? 1)
  // body fades in while stretching 0.8 → 1 of its length (see BODY_REVEAL)
  const reveal = bodyReveal(appear)
  const shown = L * reveal.stretch
  const p = clamp01(o.progress)
  const done = L * p
  const dash = holdDashPeriod(ctx) / 2
  const r = Wb / 2
  const items: SceneNode[] = [
    // track
    { type: 'rect', x: -r, y: s > 0 ? 0 : -shown, w: Wb, h: shown, fill: ctx.palette[800], opacity: 0.92 },
  ]
  // centre conveyor dashes (scroll toward the head while holding); phase stays anchored at the far end
  if (shown > done) {
    items.push({ type: 'line', x1: 0, y1: s * shown, x2: 0, y2: s * done, stroke: ctx.palette[400], strokeWidth: hair * 2.4, dash: [dash, dash], dashOffset: (o.t ?? 0) * Wb * 4, opacity: 0.75 })
  }
  if (done > 0) {
    items.push({ type: 'rect', x: -r, y: s > 0 ? 0 : -done, w: Wb, h: done, fill: ctx.palette[400] })
    items.push({ type: 'line', x1: 0, y1: 0, x2: 0, y2: s * done, stroke: ctx.palette.ring, strokeWidth: hair * 2, cap: 'butt' })
  }
  // open far end: the two side rails stop on the end point (no cap line);
  // the near end stops on the head centre, hidden under the head drawn above it
  const nearY = s > 0 ? 0 : -shown
  const rail = (x: number): SceneNode => ({ type: 'line', x1: x, y1: nearY, x2: x, y2: nearY + shown, stroke: ctx.palette[400], strokeWidth: hair * 1.6, cap: 'butt', opacity: 0.9 })
  return group([
    group(items, { clip: { type: 'rect', x: -r, y: nearY, w: Wb, h: shown } }),
    rail(-r),
    rail(r),
  ], { opacity: reveal.alpha })
}

/**
 * Long hold body: full-height rail through the note, fills toward both edges.
 *
 * Composed bottom to top: dark track + edge rails; one centre conveyor
 * running from both board edges into the head — dashes in 400 over the dark
 * track, continuing over the fill in 800 (one dash grid through both, the
 * contrast inverting at the fill front, so the filled stretch keeps the
 * conveyor's motion instead of reading as a bare slab).
 *
 * Final-stage collapse: the pillar — track, rails and done fill — narrows
 * from left and right toward its centre, eased in, down to
 * `LONG_HOLD_SHRINK_CORE`× width; the conveyor fades out with it. Live (with
 * `holdDuration`): a fixed 0.6 s close anchored to end exactly at the hold's
 * finish, so longer holds start collapsing earlier and holds shorter than
 * 0.6 s collapse across their whole length. Static consumers without
 * `holdDuration` (the baked tiles) fall back to the progress-keyed window.
 */
const LONG_HOLD_SHRINK_FROM = 0.86
const LONG_HOLD_SHRINK_CORE = 0.15
const LONG_HOLD_SHRINK_EASE = inSine
/** Live collapse length in seconds (Cylheim: 38 frames @ 30 fps ≈ 1.267). */
const LONG_HOLD_COLLAPSE_SECONDS = 0.6

export function longHoldBody(o: LongHoldBodyOptions, ctx: DrawContext): SceneNode {
  const WbFull = ctx.unit * tokens.stroke.holdBody
  const hair = ctx.unit * tokens.stroke.hair
  const appear = clamp01(o.appear ?? 1)
  const reveal = bodyReveal(appear)
  const top = o.top * reveal.stretch
  const bottom = o.bottom * reveal.stretch
  const p = clamp01(o.progress)
  // live collapse: fixed 0.6 s, ending exactly at the hold's finish; holds
  // shorter than that collapse across their whole length. Static consumers
  // without `holdDuration` fall back to the progress-keyed window.
  const holdDuration = o.holdDuration
  const shrink = holdDuration !== undefined && holdDuration > 0
    ? LONG_HOLD_SHRINK_EASE(clamp01(
        ((o.t ?? 0) - Math.max(0, holdDuration - LONG_HOLD_COLLAPSE_SECONDS))
        / Math.min(LONG_HOLD_COLLAPSE_SECONDS, holdDuration),
      ))
    : LONG_HOLD_SHRINK_EASE(seg(p, LONG_HOLD_SHRINK_FROM, 1))
  const Wb = WbFull * (1 - (1 - LONG_HOLD_SHRINK_CORE) * shrink)
  const rail = (x: number): SceneNode => ({ type: 'line', x1: x, y1: -top, x2: x, y2: bottom, stroke: ctx.palette[400], strokeWidth: hair * 1.6, opacity: 0.9 })
  const items: SceneNode[] = [
    { type: 'rect', x: -Wb / 2, y: -top, w: Wb, h: top + bottom, fill: ctx.palette[800], opacity: 0.55 },
    rail(-Wb / 2),
    rail(Wb / 2),
  ]
  // centre conveyor, streaming into the head: a decreasing dashOffset walks
  // the dashes toward each segment's far end (both renderers shift the dash
  // pattern toward the line start as the offset grows); the bottom segment
  // starts one dash into the pattern so both halves share a grid at rest.
  // The whole conveyor dies out as the collapse seals the pillar.
  const dash = holdDashPeriod(ctx) / 2
  const flow = (o.t ?? 0) * WbFull * 4
  const seal = 1 - shrink
  const conveyor = (from: number, to: number, phase: number, stroke: string, opacity: number): SceneNode => ({
    type: 'line',
    x1: 0,
    y1: from,
    x2: 0,
    y2: to,
    stroke,
    strokeWidth: hair * 2.4,
    dash: [dash, dash],
    dashOffset: phase - flow,
    opacity,
  })
  if (top > 0)
    items.push(conveyor(-top, -top * p, 0, ctx.palette[400], 0.75 * seal))
  if (bottom > 0)
    items.push(conveyor(bottom, bottom * p, dash, ctx.palette[400], 0.75 * seal))
  if (p > 0) {
    const w = lerp(Wb * 0.6, Wb, Math.min(1, p * 4))
    items.push({ type: 'rect', x: -w / 2, y: -top * p, w, h: (top + bottom) * p, fill: ctx.palette[400] })
    // the same grid continues over the fill in 800, softer than on the track
    if (top > 0)
      items.push(conveyor(-top * p, 0, 0, ctx.palette[800], 0.55 * seal))
    if (bottom > 0)
      items.push(conveyor(bottom * p, 0, dash, ctx.palette[800], 0.55 * seal))
  }
  return group(items, { opacity: reveal.alpha })
}
