/**
 * HOLD / LONG HOLD — ring + dark socket head + body (the "progress bar").
 *
 * Holds may be pressed early, so the head carries **no timing gauge**. It is
 * built to read apart from a click at a glance (user feedback: the two
 * approaches looked alike) on three independent channels:
 *
 *  - **Luminance, inverted.** A click ends as a dark band around a bright
 *    core; a hold ends as a bright band (400, the note colour) around a
 *    near-black socket (900, `CORE_R` = 0.6 R) with a static centre glyph —
 *    a circle (hold) or a square (long hold).
 *  - **Motion, in the other half.** A click's motion lands late (core swell,
 *    converging approach ring, double blink in p 0.7–1). A hold's lands
 *    early: two outer bracket arcs (Cytus II-style lock) fade in and spin
 *    ¾ turn in, decaying by p 0.6 into a slow constant drift that lands
 *    perpendicular to the body at p 1 — a fixed radius, never converging,
 *    so it never reads as a timing ring, but the late phase stays alive.
 *  - **Size.** Derived from the click's S-curve (same shape, spawn 0.34) but
 *    a touch ahead to 0.95 at p 0.7, then a slow creep onto the hit size at
 *    p 1 (`tokens.sizeCurve.hold`) — no +6 % overshoot and settle, but the
 *    head keeps swelling gently instead of freezing.
 *
 * Entry still speaks the click shade language on the palette scale: the head
 * spawns as one 600 ball, then the socket contracts out of it and sinks to
 * 900 as the band rises to 400. Every shade (and the brackets) stays
 * WAKE_DROP steps darker until the hold's own wake (`HOLD_WAKE`, 0.3–0.85,
 * sine — same midpoint as the click's WAKE, twice as gentle) — a page cue,
 * not a gauge. No arrows: arrows would suggest dragging.
 *
 * Holding is split into independent layers (frame-friendly), composed as
 * press → loop → progress (bottom to top):
 *   press    (once, 0.2 s)   head sinks to 0.86 scale; the brackets clamp
 *                            onto the ring and merge into it (the "lock")
 *   loop     (loop, 0.6 s)   dark-socket ping inside + two outer ripples (seamless)
 *   progress (progress 0–1)  Cytoid-style progress ring: white lead (4/3·p) + fill (p)
 * The clear effect plays where the scanline is the moment the hold **ends**:
 * the consumer anchors the origin-centred clip at the note's end
 * position — the body's far end for a hold, the line's position mid-board for
 * the full-height long-hold pillar — where the release dot has just lit; the
 * opening flash is that dot detonating (`ClearFlavor.flash = 'tail'`), not a
 * phantom note.
 * Bodies (see ./bodies.ts) are stretched elements, not frame clips.
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { inOutQuad, inOutSine, lerp, outBack, outCubic, outQuart, riseSettleCurve, seg, TAU } from '../core/ease'
import { group } from '../core/scene'
import { ringTone, tone } from '../palette'
import { tokens } from '../tokens'
import { ringWidth, wakeShade } from './click'
import { makeClearClips, makeExitClip, makeMissClip } from './effects'
import { arc, assemblingRing, disk, ring } from './parts'

const PRESSED = 0.86
/** Cytoid ProgressRing: outer radius ≈ 1.42 R, thickness ≈ 0.083 u */
const PROGRESS_R = 1.34

/**
 * Centre glyph: circle (hold) or square (long hold), outline only. `r` = circle
 * radius; the square is drawn smaller (half-size 0.82·r) so both read as the
 * same visual area.
 */
function glyphShape(long: boolean, r: number, width: number, color: string, opacity = 1): SceneNode {
  const s = r * 0.82
  return long
    ? { type: 'rect', x: -s, y: -s, w: s * 2, h: s * 2, stroke: color, strokeWidth: width, join: 'miter', opacity }
    : ring(r, width, color, opacity)
}

/** Dark socket radius (× R) once split. */
const CORE_R = 0.6
/** Scale step of the dark socket once awake. */
const HOLD_CORE = 900
const GLYPH = 0.2

/** Outer lock brackets: radius (× R), half span (rad), stroke (× hair). */
const BRACKET = { r: 1.2, half: TAU * 0.16, width: 2.6 }
/**
 * Bracket motion: fade p 0.1–0.25; a fast ¾ turn spin-in (outCubic, p 0.1–0.6)
 * riding on a slow constant cruise (`cruise` turns over p 0.1–1), so the
 * brackets never stop: the spin-in decays into a steady drift that lands
 * exactly on the rest pose (perpendicular to the body) at p 1, where the
 * press clamps them onto the ring. Constant-rate drift carries no timing.
 */
const BRACKET_TIMING = { from: 0.1, fadeTo: 0.25, spinTo: 0.6, turns: 0.75, cruise: 0.3 }

/**
 * Two bracket arcs centred left / right (perpendicular to the body, so they
 * never sit on it). `r` = radius, `spin` = rotation, `a` = opacity.
 */
function brackets(ctx: DrawContext, r: number, spin: number, color: string, a: number, width?: number): SceneNode | null {
  if (a <= 0)
    return null
  const w = width ?? ctx.unit * tokens.stroke.hair * BRACKET.width
  return group(
    [TAU / 4, TAU * 3 / 4].map(mid => arc(r, mid + spin - BRACKET.half, mid + spin + BRACKET.half, w, color)),
    { opacity: a },
  )
}

/**
 * Head; `k` = build progress 0..1 (fast), `glyph` = centre glyph reveal,
 * `split` = shade split 0..1 (steady poses use the default 1).
 */
function holdHead(ctx: DrawContext, long: boolean, k: number, glyph: number, split = 1, wake = 1): SceneNode {
  const R = ctx.size / 2
  const W = ringWidth(ctx)
  const inner = R - W
  const gw = ctx.unit * tokens.stroke.hair * 1.6
  // the head spawns as one 600 ball; the split walks the band to 400 and
  // contracts the socket out of it, sinking to HOLD_CORE.
  // Asleep (next page) both sit WAKE_DROP steps darker.
  const ball = lerp(600, wakeShade(400, wake), split)
  const core = lerp(600, wakeShade(HOLD_CORE, wake), split)
  return group([
    // solid ball from the first frame
    disk(inner + 0.5, tone(ctx.palette, ball)),
    disk(lerp(inner + 0.5, R * CORE_R, split), tone(ctx.palette, core)),
    glyph > 0 ? group([glyphShape(long, R * GLYPH, gw, ringTone(ctx.palette, wake))], { opacity: seg(glyph, 0, 0.5), transform: { scale: lerp(0.4, 1, outBack(glyph, 2)) } }) : null,
    assemblingRing(R - W / 2, lerp(W * 0.5, W, k), ringTone(ctx.palette, wake), 2, outQuart(k), lerp(-TAU / 4, 0, k), 1, { color: tokens.edge, fraction: tokens.stroke.edge }),
  ].filter(Boolean) as SceneNode[])
}

/**
 * Hold wake (0 asleep → 1 lit): the click's WAKE window is too short for a
 * hold — its lit band, ring and brackets are a large bright area, and
 * brightening them all inside 0.3 s read as a glitch. Same midpoint as the
 * shared WAKE (≈ 0.575, so pages still separate the same way), spread over
 * twice the span with a gentler sine ease.
 */
export const HOLD_WAKE = { from: 0.3, to: 0.85 }

export function holdWake(p: number): number {
  return inOutSine(seg(p, HOLD_WAKE.from, HOLD_WAKE.to))
}

/** Size: the click's S-curve, a touch ahead, then a slow creep onto 1 at p 1 — no overshoot (`tokens.sizeCurve.hold`). */
export const holdSize = riseSettleCurve(tokens.sizeCurve.hold, tokens.sizeCurve.s)

function holdEnter(long: boolean) {
  return (p: number, ctx: DrawContext): SceneNode => {
    const R = ctx.size / 2
    // internals steady by p = 0.35 — no timing to read on a hold head
    const k = outCubic(seg(p, 0, 0.35))
    const glyph = seg(p, 0.2, 0.42)
    // split starts after the fade-in (0.08) and lands with the steady pose (0.35)
    const split = inOutQuad(seg(p, 0.08, 0.35))
    const wake = holdWake(p)
    const head = holdHead(ctx, long, k, glyph, split, wake)
    const { from, fadeTo, spinTo, turns, cruise } = BRACKET_TIMING
    const spin = -TAU * (turns * (1 - outCubic(seg(p, from, spinTo))) + cruise * (1 - seg(p, from, 1)))
    const lock = brackets(ctx, R * BRACKET.r, spin, ringTone(ctx.palette, wake), seg(p, from, fadeTo))
    return group([lock, head].filter(Boolean) as SceneNode[], { opacity: seg(p, 0, 0.08), transform: { scale: holdSize(p) } })
  }
}

/** Head in pressed state; t = seconds since hold start. The brackets clamp onto the ring. */
function holdPress(long: boolean) {
  return (t: number, ctx: DrawContext): SceneNode => {
    const R = ctx.size / 2
    const W = ringWidth(ctx)
    const k = outCubic(seg(t, 0, tokens.time.holdPress))
    const hair = ctx.unit * tokens.stroke.hair
    const lock = brackets(ctx, lerp(R * BRACKET.r, R - W / 2, k), 0, ctx.palette.ring, 1 - seg(t, tokens.time.holdPress * 0.5, tokens.time.holdPress), lerp(hair * BRACKET.width, W, k))
    return group([lock, holdHead(ctx, long, 1, 1)].filter(Boolean) as SceneNode[], { transform: { scale: lerp(1, PRESSED, k) } })
  }
}

/**
 * While held:
 *  - inside: the dark socket itself pings (Tailwind `animate-ping`): a copy of
 *    the core disc scales 1 → 2 and fades out over the first 75 % of each
 *    half period — the same rate as the outer ripples — ease ≈
 *    cubic-bezier(0, 0, 0.2, 1). The glyph stays still on top.
 *  - outside: two thin ripples, half a period apart, beyond the progress ring.
 * Both are seamless over `holdLoop`.
 */
function holdLoop(long: boolean) {
  return (t: number, ctx: DrawContext): SceneNode => {
    const R = ctx.size / 2
    const hair = ctx.unit * tokens.stroke.hair
    const P = tokens.time.holdLoop
    const u = (((t % P) + P) % P) / P
    // one ping per ripple: two per period, in phase with the outer ripples
    const w = (u * 2) % 1
    const k = outCubic(seg(w, 0, 0.75))
    const coreR = R * PRESSED * CORE_R
    const coreColour = tone(ctx.palette, HOLD_CORE)
    // clipped to the head interior so the ping never dims the white ring
    const innerPressed = (R - ringWidth(ctx)) * PRESSED
    const ping = w < 0.75
      ? group([disk(coreR * lerp(1, 2, k), coreColour, 0.8 * (1 - k))], { clip: { type: 'circle', r: innerPressed } })
      : null
    const glyph = glyphShape(long, R * PRESSED * GLYPH, ctx.unit * tokens.stroke.hair * 1.6 * PRESSED, ctx.palette.ring)
    const ripples: SceneNode[] = []
    for (let i = 0; i < 2; i++) {
      const v = (u + i / 2) % 1
      ripples.push(ring(R * lerp(PROGRESS_R + 0.12, long ? 2.05 : 1.85, outCubic(v)), hair * lerp(2.4, 0.6, v), ctx.palette[300], (1 - v) ** 1.5 * 0.85))
    }
    return group([...ripples, ping, glyph].filter(Boolean) as SceneNode[])
  }
}

function holdProgress(_long: boolean) {
  return (p: number, ctx: DrawContext): SceneNode => {
    const R = ctx.size / 2
    const W = ctx.unit * 0.083
    const r = R * PROGRESS_R
    const lead = Math.min(1, p * 4 / 3)
    const done = Math.min(1, p)
    return group([
      ring(r, W, ctx.palette[800], 0.9),
      lead > 0 ? arc(r, 0, TAU * lead, W, ctx.palette.ring) : null,
      done > 0 ? arc(r, 0, TAU * done, W, ctx.palette[400]) : null,
    ].filter(Boolean) as SceneNode[])
  }
}

function makeHold(long: boolean): NoteDesign {
  return {
    kind: long ? 'long-hold' : 'hold',
    enter: {
      id: 'enter',
      mode: 'normalized',
      duration: tokens.time.enter,
      draw: holdEnter(long),
      note: long
        ? 'Reads apart from a click: the click\'s S-curve, a touch ahead, no overshoot, two lock brackets spin in, then drift slowly onto their rest pose at p 1; the head creeps 0.95 → 1 late. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); square glyph. Colours wake gently over p 0.3–0.85 (page cue).'
        : 'Reads apart from a click: the click\'s S-curve, a touch ahead, no overshoot, two lock brackets spin in, then drift slowly onto their rest pose at p 1; the head creeps 0.95 → 1 late. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); circle glyph. Colours wake gently over p 0.3–0.85 (page cue).',
    },
    hold: {
      press: { id: 'hold-press', mode: 'once', duration: tokens.time.holdPress, draw: holdPress(long), note: 'Head sinks to 0.86; the lock brackets clamp onto the ring and merge into it.' },
      loop: { id: 'hold-loop', mode: 'loop', duration: tokens.time.holdLoop, draw: holdLoop(long), note: 'The dark socket pings (Tailwind-style scale 1→2 + fade) under the still glyph; two outer ripples pulse. Drawn above the head. Seamless.' },
      progress: { id: 'hold-progress', mode: 'progress', duration: 1, draw: holdProgress(long), note: 'Cytoid-style progress ring: white lead at 4/3·p, fill at p.' },
    },
    clear: makeClearClips({ shape: 'circle', reach: long ? 1.6 : 1.5, sectors: 24, extra: long ? 'beam' : 'double', flash: 'tail', seed: long ? 4 : 3 }),
    // never pressed: the head rewinds and fades (no 0.8 step — still pressable);
    // the body fades on its own, faster curve (`holdBodyExitAlpha`)
    exit: makeExitClip(holdEnter(long), tokens.time.exit.holdHead),
    // released early: the head was alive until the release, so it powers down there
    miss: makeMissClip('circle'),
  }
}

export const hold = makeHold(false)
export const longHold = makeHold(true)
