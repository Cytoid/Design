/**
 * CLICK — circle, ring waking on its own neutral band (400 → 50), solid colour ball + growing core on the family's 50–950 scale.
 *
 * Timing feedback: a dim
 * pre-roll — which is also what tells the next page apart from the current
 * one — then a late, accelerating core, a visible converging ring and a
 * blink right before the hit.
 *
 *  0.00–1.00  size follows the fitted S-curve (`tokens.sizeCurve.click`):
 *             a small dim spawn (0.32), one smooth slow-fast-slow growth into a
 *             +6 % peak at p 0.88 — together with the lead-in blink and the
 *             converging ring — then a smooth settle, exactly 1.0 (the hit
 *             pose) from p 0.976
 *  0.00–0.10  fade in; the ring is complete from the first frame — the
 *             entrance is carried by the fade, the S-curve size and the shade
 *             wake alone
 *  0.00–0.40  ring entrance: the frame enters darker (ring band 800) and rises
 *             to the 400 anchor (inCubic; the old arc assembly's slot), then
 *             wakes 400 → resting on the shared gentle ring wake (0.3–0.85)
 *  0.00–0.40  one flat ball: the core sits at 0.36, blended into the 700 shade —
 *             no internal motion to read
 *  0.40–0.85  shade split: the core is differentiated out (rises 700 → 400, true
 *             colour), the background sinks 700 → 800 (full, uncompressed
 *             contrast — ΔL ≈ 0.3 at the hit)
 *  0.42–0.94  the core (already at 0.36 — barely moving early, stable) swells
 *             ease-in onto the frame's final inner edge — most of the growth
 *             lands in the last third
 *  0.70–1.00  approach ring contracts *linearly in time* from 1.83 R onto the ring
 *             (≈ 0.08 R thick, ≤ 50 % opacity)
 *  0.70–1.00  the frame thickens inward by half a stroke width (ease-in —
 *             fast at contact) while the core has risen to its final inner
 *             edge: at p = 1 core and frame coincide exactly — one
 *             "core meets frame" closure with no separate layer
 *  0.86–1.00  double blink: a lead-in flash (0.86–0.89) then the final blink (0.92–1);
 *             the core flashes white twice — the ring's own width only moves
 *             with the late frame thickening, settling exactly at p = 1
 *             (the hit pose is calm and full)
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { bump, inCubic, inOutQuad, inOutSine, inQuad, lerp, outCubic, outQuad, riseSettleCurve, seg } from '../core/ease'
import { group } from '../core/scene'
import { ringTone, tone } from '../palette'
import { tokens } from '../tokens'
import { makeClearClips, makeExitClip } from './effects'
import { arrowHead, disk, edgedRing, ring, ringEdge } from './parts'

/** Ring stroke for a note of this size (thinner on small notes). */
export function ringWidth(ctx: DrawContext) {
  return ctx.unit * tokens.stroke.ring * (ctx.size / ctx.unit) ** 0.5
}

/** Phase boundaries (normalised). */
export const CLICK_TIMING = {
  splitFrom: 0.4,
  splitTo: 0.85,
  coreFrom: 0.42,
  coreFull: 0.94,
  approachFrom: 0.7,
  frameFrom: 0.7,
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

/**
 * Frame thickening: from p 0.7 the ring's stroke grows inward by half a
 * stroke width (ease-in, so the contact is fast — no slow last frames), to
 * 1.5·W at the hit. The core rises onto the thickened frame's inner edge, so
 * core and frame coincide exactly at p = 1 — one "core meets frame" closure
 * with the ring as the only moving part.
 */
/** Stroke-width multiplier of the frame at progress `p`: 1 → 1.5 over 0.7–1. */
export function frameThickening(p: number): number {
  return lerp(1, 1.5, inQuad(seg(p, CLICK_TIMING.frameFrom, 1)))
}

/** Click/Flick spawn shade: the whole ball starts here before the split. */
export const SPAWN_SHADE = 700

/** Peak opacity of the pre-hit flash (ring material over the core). */
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
 * their shape settles early but every fill shade sits WAKE_DROP steps darker
 * until the second half of the approach, so next-page notes read darker than
 * the ones about to be played — pages separate by this dim → lit arc, not
 * by direction colour. The ring wakes on its own gentler curve
 * (`RING_WAKE`) after its entrance.
 */
export const WAKE = { from: 0.45, to: 0.7 }

export function wakeAmount(p: number): number {
  return inOutQuad(seg(p, WAKE.from, WAKE.to))
}

/**
 * Ring wake: the gentle sine the hold originally used for its large lit
 * area — the ring is a bright band too, and the fills' faster eases (the
 * split's outQuad, WAKE's inOutQuad) sprint it and read as a pop. Window
 * 0.3–0.85, same midpoint as the fills' WAKE, spread over twice the span.
 */
export const RING_WAKE = { from: 0.3, to: 0.85 }

export function ringWake(p: number): number {
  return inOutSine(seg(p, RING_WAKE.from, RING_WAKE.to))
}

/**
 * Ring entrance: colour takes the slot the deleted arc assembly used to
 * occupy — the frame enters darker than the old pose (band 800) and rises to
 * the 400 anchor by p 0.4, inCubic so the dark pose survives the opacity
 * fade-in (0–0.1). From there `ringWake` carries 400 → resting on the same
 * curve for the whole family. Shared by every ring-riding element (frames,
 * chevrons, arrow, brackets, glyph).
 */
export const RING_ENTER = { from: 0, to: 0.4, fromShade: 800, anchor: 400 }

/** Ring band step at `p`: the dark entrance, then the shared wake down to resting 50. */
export function ringStep(p: number): number {
  const enter = seg(p, RING_ENTER.from, RING_ENTER.to)
  return enter < 1
    ? lerp(RING_ENTER.fromShade, RING_ENTER.anchor, inCubic(enter))
    : lerp(RING_ENTER.anchor, 50, ringWake(p))
}

/** How many scale steps darker a note sits while asleep. */
export const WAKE_DROP = 200

/** Scale step of a shade whose lit step is `lit`: WAKE_DROP darker while asleep (w = 0). */
export function wakeShade(lit: number, w: number): number {
  return lit + WAKE_DROP * (1 - w)
}

export interface ClickOptions {
  /** extra glyph drawn above the core (e.g. a drag arrow) */
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
  const frameW = W * frameThickening(p)
  const scale = clickSize(p)

  // the core rises exactly onto the thickened frame's final inner edge
  // (inner − W/2): at the hit core and frame coincide, no base rim between them
  const coreR = (inner - W / 2) * coreGrowth(p)
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
    // frame: outer edge pinned at R, thickens inward by half a stroke over 0.7–1
    edgedRing(R - frameW / 2, frameW, ringTone(ctx.palette, ringStep(p)), 1, ringEdge()),
  ].filter(Boolean) as SceneNode[], { transform: { scale } })

  return group([approach, body].filter(Boolean) as SceneNode[], { opacity: a })
}

/** Arrow (Cytoid CDragFill) pointing along the chain; `ctx.heading` rotates it. `ringStep` = ring band step (50 resting). */
export function dragArrow(ctx: DrawContext, inner: number, show: number, ringStep = 50): SceneNode | null {
  if (show <= 0)
    return null
  return group([arrowHead(inner * 1.05, ringTone(ctx.palette, ringStep))], {
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
    note: 'Size follows the fitted S-curve: dim small spawn, one slow-fast-slow growth into the +6 % peak with the double blink, settled on the exact hit pose from p 0.976; approach ring converges linearly over the last 30 %; the ring thickens inward by half a stroke width while the core rises onto its final inner edge — core and frame coincide exactly at the hit. The ring enters darker (band 800 → 400 over 0–0.4, the old assembly slot), then wakes 400 → resting on the shared gentle ring wake (0.3–0.85 sine).',
  },
  clear: makeClearClips({ shape: 'circle', reach: 1.45, sectors: 24, extra: 'double', seed: 1 }),
  exit: makeExitClip((p, ctx) => clickEnter(p, ctx)),
}

/**
 * Experiment: no arrow. The head is drawn exactly like a click — only the
 * chain (child beads + path) says it is a drag start.
 */
export const clickDragHead: NoteDesign = {
  ...click,
  kind: 'click-drag-head',
  enter: {
    ...click.enter,
    note: 'Experiment: identical to click, no arrow — the chain alone marks the drag start.',
  },
}
