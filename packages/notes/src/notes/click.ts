/**
 * CLICK — circle, neutral ring (wakes 400 → 50), solid colour ball + growing core on the 50–950 shade scale.
 *
 * Timing feedback: a dim
 * pre-roll — which is also what tells the next page apart from the current
 * one — then a late, accelerating core, a visible converging ring and a
 * blink right before the hit.
 *
 *  0.00–0.10  fade in
 *  0.00–1.00  size follows the fitted S-curve (`tokens.sizeCurve.click`):
 *             a small dim spawn (0.32), one smooth slow-fast-slow growth into a
 *             +6 % peak at p 0.88 — together with the lead-in blink and the
 *             converging ring — then a smooth settle, exactly 1.0 (the hit
 *             pose) from p 0.976
 *  0.00–0.10  fade in; 0–0.40 the outer ring assembles from 3 arcs
 *  0.00–0.40  one flat ball: the core sits at 0.36, blended into the 700 shade —
 *             no internal motion to read
 *  0.40–0.85  shade split: the core is differentiated out (rises 700 → 400, true
 *             colour), the background sinks 700 → 800 (full, uncompressed
 *             contrast — ΔL ≈ 0.3 at the hit)
 *  0.42–0.94  the core (already at 0.36 — barely moving early, stable) swells
 *             ease-in to 0.8·inner — most of the growth lands in the last third
 *  0.70–1.00  approach ring contracts *linearly in time* from 1.83 R onto the ring
 *             (≈ 0.08 R thick, ≤ 50 % opacity)
 *  0.86–1.00  double blink: a lead-in flash (0.86–0.89) then the final blink (0.92–1);
 *             the core flashes white twice — the ring's own width stays a stable
 *             build-only motion, settling exactly at p = 1
 *             (the hit pose is calm and full)
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { bump, inOutQuad, inQuad, lerp, outCubic, outQuad, outQuart, riseSettleCurve, seg, TAU } from '../core/ease'
import { group } from '../core/scene'
import { ringTone, tone } from '../palette'
import { tokens } from '../tokens'
import { makeClearClips, makeMissClip } from './effects'
import { arrowHead, assemblingRing, disk, ring } from './parts'

/** Ring stroke for a note of this size (thinner on small notes). */
export function ringWidth(ctx: DrawContext) {
  return ctx.unit * tokens.stroke.ring * (ctx.size / ctx.unit) ** 0.5
}

/** Max core radius relative to the inner radius. */
export const CORE_MAX = 0.8

/** Phase boundaries (normalised). */
export const CLICK_TIMING = {
  splitFrom: 0.4,
  splitTo: 0.85,
  coreFrom: 0.42,
  coreFull: 0.94,
  approachFrom: 0.7,
  readyBlinkFrom: 0.86,
  blinkFrom: 0.92,
}

/**
 * Core blink envelope: a lead-in blink (0.86–0.89) + the final one (0.92–1) — a double
 *  flash right before the hit.
 */
export function blinkAmount(p: number): number {
  return Math.max(
    bump(p, CLICK_TIMING.readyBlinkFrom, CLICK_TIMING.blinkFrom),
    bump(p, CLICK_TIMING.blinkFrom, 1),
  )
}

/**
 * Enter size at progress `p` (1 = hit pose): one fitted S-curve carries the
 * ball from the small dim spawn (0.32) up through the full-size crossing
 * (p ≈ 0.74) to the +6 % overshoot peak at p 0.878 — together with the
 * lead-in blink and the converging ring — and a second S settles it back to
 * exactly 1.0 by p 0.976 (`tokens.sizeCurve`). The flick shares this curve.
 */
export const clickSize = riseSettleCurve(tokens.sizeCurve.click, tokens.sizeCurve.s)

/** Click/Flick spawn shade: the whole ball starts here before the split. */
export const SPAWN_SHADE = 700

/** Peak opacity of the pre-hit flash (neutral material over the core). */
export const BLINK_PEAK = 0.3

/**
 * Shade progression on the palette scale (`tone`): everything starts at SPAWN_SHADE (700);
 * as the hit approaches the core rises 700 → 400 (the true colour) while the
 * background sinks 700 → 800, so contrast — not whiteness — carries the
 * timing, and the hit pose shows the true colour (ΔL ≈ 0.3).
 */
export function splitShades(p: number, ctx: DrawContext) {
  const k = outQuad(seg(p, CLICK_TIMING.splitFrom, CLICK_TIMING.splitTo))
  return { base: tone(ctx.palette, lerp(SPAWN_SHADE, 800, k)), core: tone(ctx.palette, lerp(SPAWN_SHADE, 400, k)), k }
}

/**
 * Page cue for notes without a timing gauge (hold, long hold, drag family):
 * their shape settles early but every shade sits WAKE_DROP steps darker until the
 * second half of the approach, so next-page notes read darker than the ones
 * about to be played — pages separate by this dim → lit arc, not
 * by direction colour.
 */
export const WAKE = { from: 0.45, to: 0.7 }

export function wakeAmount(p: number): number {
  return inOutQuad(seg(p, WAKE.from, WAKE.to))
}

/** How many scale steps darker a note sits while asleep. */
export const WAKE_DROP = 200

/** Scale step of a shade whose lit step is `lit`: WAKE_DROP darker while asleep (w = 0). */
export function wakeShade(lit: number, w: number): number {
  return lit + WAKE_DROP * (1 - w)
}

export interface ClickOptions {
  /** extra glyph drawn above the core (click-drag head arrow) */
  glyph?: (p: number, ctx: DrawContext, inner: number) => SceneNode | null
}

/**
 * Core size 0..1 shared with flick: a big dot (0.36) that swells late
 * (ease-in). Starting large means it barely moves early — the core reads as
 * stable, not lively — and the deferred shade split (`splitFrom` 0.4) keeps
 * it blended into the ball until the second half, so the late growth is
 * what gets revealed, not chased.
 */
export function coreGrowth(p: number): number {
  return lerp(0.36, 1, inQuad(seg(p, CLICK_TIMING.coreFrom, CLICK_TIMING.coreFull)))
}

export function clickEnter(p: number, ctx: DrawContext, o: ClickOptions = {}): SceneNode {
  const R = ctx.size / 2
  const W = ringWidth(ctx)
  const hair = ctx.unit * tokens.stroke.hair
  const inner = R - W
  const a = outCubic(seg(p, 0, 0.1))
  const build = outQuart(seg(p, 0, 0.4))
  const scale = clickSize(p)

  // the core stops at 0.8·inner: a rim of the note colour stays visible at the hit (hue identity)
  const coreR = inner * CORE_MAX * coreGrowth(p)
  const blink = blinkAmount(p)
  const split = splitShades(p, ctx)

  // approach ring: linear in time so its speed is readable; hairline weight —
  // a hint, not a feature
  const ap = seg(p, CLICK_TIMING.approachFrom, 1)
  const approach = ap > 0 && ap < 1
    ? ring(lerp(R * 1.83, R - W / 2, ap), hair * lerp(0.375, 0.525, ap), ctx.palette.ring, 0.5 * seg(ap, 0, 0.15))
    : null

  const body = group([
    // solid ball from the first frame; 700 → core rises to 400, background sinks to 800
    disk(inner + 0.5, split.base),
    // the core only appears once the split starts (0.4): before that the ball
    // reads as one flat disc — the deferred differentiation is the point
    split.k > 0 ? disk(coreR, split.core, split.k) : null,
    blink > 0 ? disk(coreR, ctx.palette.ring, BLINK_PEAK * blink) : null,
    o.glyph?.(p, ctx, inner) ?? null,
    assemblingRing(R - W / 2, lerp(W * 0.45, W, build), ringTone(ctx.palette, split.k), 3, build, lerp(-TAU / 6, 0, build), 1, { color: tokens.edge, fraction: tokens.stroke.edge }),
  ].filter(Boolean) as SceneNode[], { transform: { scale } })

  return group([approach, body].filter(Boolean) as SceneNode[], { opacity: a })
}

/** Arrow (Cytoid CDragFill) pointing along the chain; `ctx.heading` rotates it. Rides the ring's neutral wake. */
export function dragArrow(ctx: DrawContext, inner: number, show: number, wake = 1): SceneNode | null {
  if (show <= 0)
    return null
  return group([arrowHead(inner * 1.05, ringTone(ctx.palette, wake))], {
    opacity: show,
    transform: { rotate: ctx.heading, scale: lerp(0.6, 1, show) },
  })
}

export const click: NoteDesign = {
  kind: 'click',
  enter: {
    id: 'enter',
    mode: 'normalized',
    duration: tokens.time.enter,
    draw: (p, ctx) => clickEnter(p, ctx),
    note: 'Size follows the fitted S-curve: dim small spawn, one slow-fast-slow growth into the +6 % peak with the double blink, settled on the exact hit pose from p 0.976; approach ring converges linearly over the last 30 %. Ring (and the click-drag arrow) wake neutral 400 → 50 with the shade split.',
  },
  clear: makeClearClips({ shape: 'circle', reach: 1.45, sectors: 24, extra: 'double', seed: 1 }),
  miss: makeMissClip('circle'),
}

export const clickDragHead: NoteDesign = {
  ...click,
  kind: 'click-drag-head',
  enter: {
    ...click.enter,
    draw: (p, ctx) => clickEnter(p, ctx, { glyph: (pp, c, inner) => dragArrow(c, inner * 0.62, outCubic(seg(pp, 0.1, 0.3)), splitShades(pp, c).k) }),
    note: 'Click timing + white arrow pointing along the chain (rotate by heading).',
  },
}
