/**
 * Stretched elements: hold body, long-hold body, drag connection line.
 * These depend on chart geometry, so they are parametric vector parts.
 * For frame consumers they are baked as tileable strips (see bake).
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext } from './types'
import { clamp01, inSine, lerp, outBack, outCubic, seg } from '../core/ease'
import { group } from '../core/scene'
import { ringTone } from '../palette'
import { tokens } from '../tokens'

export interface HoldBodyOptions {
  /** body length in px (from note centre to hold end) */
  length: number
  /** hold progress 0–1 */
  progress: number
  /** seconds — scrolls the centre dashes while holding */
  t?: number
  /** fade-in of the body (follows the head entrance) */
  appear?: number
}

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
 * Length of the hold body's end piece (whole px): the rounded end, the full
 * stop and the gap before it — no conveyor dashes inside it.
 */
export function holdEndLength(ctx: DrawContext): number {
  return Math.max(2, Math.round(ctx.unit * tokens.stroke.holdBody * 0.9))
}

/**
 * Hold body in note-local space. Extends toward -y for `up`, +y for `down`.
 *
 * The far end is rounded (half-circle, inside the hold length — the end
 * point does not move) and the conveyor ends in a full stop: dashes, a gap,
 * one dim dot. The dot lights white as the fill arrives (progress 0.9–1),
 * meeting the white midline — the release cue.
 *
 * A thin border traces the capsule — unclipped, so its full hair width reads
 * (the long-hold edge-rail recipe; user feedback: the empty track's length
 * was too faint). The fill later covers the inner half in the same colour,
 * leaving the border to rim the filled bar.
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
  const dashEnd = shown - holdEndLength(ctx)
  const items: SceneNode[] = [
    // track
    { type: 'rect', x: -r, y: s > 0 ? 0 : -shown, w: Wb, h: shown, fill: ctx.palette[800], opacity: 0.92 },
  ]
  // centre conveyor dashes (scroll toward the head while holding); phase stays anchored at the far end
  if (dashEnd > done) {
    items.push({ type: 'line', x1: 0, y1: s * dashEnd, x2: 0, y2: s * done, stroke: ctx.palette[400], strokeWidth: hair * 2.4, dash: [dash, dash], dashOffset: (o.t ?? 0) * Wb * 4 + shown - dashEnd, opacity: 0.75 })
  }
  if (done > 0) {
    items.push({ type: 'rect', x: -r, y: s > 0 ? 0 : -done, w: Wb, h: done, fill: ctx.palette[400] })
    if (dashEnd > 0)
      items.push({ type: 'line', x1: 0, y1: 0, x2: 0, y2: s * Math.min(done, dashEnd), stroke: ctx.palette.ring, strokeWidth: hair * 2, cap: 'butt' })
  }
  // full stop: dim neutral at rest, lights white as the fill lands
  const lit = outCubic(seg(p, 0.9, 1))
  items.push({
    type: 'circle',
    cx: 0,
    cy: s * (shown - r),
    r: lerp(hair * 2.2, hair * 3.2, outBack(lit, 2)),
    fill: lit > 0 ? ctx.palette.ring : ringTone(ctx.palette, 0),
    opacity: lerp(0.75, 1, lit),
  })
  // rounded far end: clip the whole body to a capsule whose near end hides under the head
  const rx = Math.min(r, (shown + r) / 2)
  const nearY = s > 0 ? -r : -shown
  return group([
    group(items, { clip: { type: 'rect', x: -r, y: nearY, w: Wb, h: shown + r, rx } }),
    { type: 'rect', x: -r, y: nearY, w: Wb, h: shown + r, rx, stroke: ctx.palette[400], strokeWidth: hair * 1.6, opacity: 0.9 },
  ], { opacity: reveal.alpha })
}

export interface LongHoldBodyOptions {
  /** distance from note centre to the top of the play area */
  top: number
  /** distance from note centre to the bottom of the play area */
  bottom: number
  /** hold progress 0–1 */
  progress: number
  /** seconds since the hit — scrolls the centre dashes, drives the live collapse */
  t?: number
  /** hit → finish seconds; enables the time-anchored collapse */
  holdDuration?: number
  /** fade-in of the body (follows the head entrance) */
  appear?: number
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

export interface DragLineOptions {
  x1: number
  y1: number
  x2: number
  y2: number
  /** leading edge 0–1 (line grows from source toward destination) */
  lead?: number
  /** trailing edge 0–1 (line retracts as the scanner passes) */
  trail?: number
  opacity?: number
  /** override dash length in px (bakers round it to whole pixels for seamless tiles) */
  dash?: number
}

/**
 * Drag connection between two notes, in world space. Drawn under the notes.
 * Unchanged from Cytoid: white, dashed (50 % duty), same width. The dash
 * pattern is anchored to the source note so it does not crawl while the
 * trailing edge retracts.
 */
export function dragLine(o: DragLineOptions, ctx: DrawContext): SceneNode | null {
  const lead = clamp01(o.lead ?? 1)
  const trail = clamp01(o.trail ?? 0)
  if (lead <= trail)
    return null
  const W = ctx.unit * tokens.stroke.dragLine
  const dash = o.dash ?? ctx.unit * tokens.stroke.dragDash
  const len = Math.hypot(o.x2 - o.x1, o.y2 - o.y1)
  return {
    type: 'line',
    x1: lerp(o.x1, o.x2, trail),
    y1: lerp(o.y1, o.y2, trail),
    x2: lerp(o.x1, o.x2, lead),
    y2: lerp(o.y1, o.y2, lead),
    stroke: ctx.palette.ring,
    strokeWidth: W,
    cap: 'butt',
    dash: [dash, dash],
    dashOffset: trail * len,
    opacity: o.opacity ?? 1,
  }
}
