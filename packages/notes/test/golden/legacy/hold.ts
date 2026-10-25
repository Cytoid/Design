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
 *    in on a heavily damped (viscous) decay, slowing into a faint drift that
 *    lands perpendicular to the body ≈ 4 frames before the hit (so a press
 *    on the beat finds it still) — a fixed radius, never converging,
 *    so it never reads as a timing ring, but the late phase stays alive.
 *  - **Size.** One monotone ease (`tokens.sizeCurve.hold`, spawn 0.34)
 *    tracking the click's growth closely but a touch ahead — no +6 %
 *    overshoot and settle. Its long ease-out tail keeps the head swelling
 *    gently late and lands together with the brackets, so the head is fully
 *    still ≈ 4 frames before the hit.
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
 *   progress (progress 0–1)  Cytoid-style progress ring: 800 track, 50 lead (4/3·p) + 500 fill (p)
 * The clear effect plays where the scanline is the moment the hold **ends**:
 * the consumer anchors the origin-centred clip at the note's end
 * position — the body's far end for a hold, the line's position mid-board for
 * the full-height long-hold pillar — where the body's flat end has just met the line; the
 * opening flash is the body end detonating (`ClearFlavor.flash = 'tail'`), not a
 * phantom note.
 * Bodies (see ./bodies.ts) are stretched elements, not frame clips.
 */
import type { SceneNode } from '../../../src/core/scene'
import type { DrawContext, NoteDesign } from '../../../src/notes/types'
import { cubicBezier, inOutQuad, inOutSine, lerp, outBack, outCubic, outQuart, seg, TAU } from '../../../src/core/ease'
import { group } from '../../../src/core/scene'
import { ringTone, tone } from '../../../src/palette'
import { tokens } from '../../../src/tokens'
import { ringWidth, wakeShade } from './click'
import { makeClearClips, makeExitClip, makeMissClip } from './effects'
import { arc, assemblingRing, disk, ring, ringEdge } from './parts'

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
 * Bracket motion: fade p 0.1–0.25; one heavily damped spin (`turns` from
 * p 0.1) on a viscous, exponential decay (`damping` = k in
 * (1 − e^(−k·u)) / (1 − e^(−k))): a fast spin-in that bleeds off into an
 * ever slower drift — ≈ 20° over the last 40 %, still creeping as it lands
 * on the rest pose (perpendicular to the body). It never stalls mid-way, so
 * the late phase stays alive, but it slows monotonically — no timing to read.
 *
 * It lands `settle` seconds (≈ 4 frames @ 60 fps) *before* the hit — real
 * time, from `ctx.approach`, so the margin holds at every scroll speed — and
 * rests there: a press on the beat finds a still head, and the press clamps
 * the brackets onto the ring from that pose. The landing speed (≈ 12°/s)
 * is far below what a stop could show.
 */
const BRACKET_TIMING = { from: 0.1, fadeTo: 0.25, turns: 1.05, damping: 5, settle: 4 / 60 }

/** Enter progress at which the brackets land: `settle` seconds before the hit (capped to the last 20 %). */
function bracketLandP(ctx: DrawContext): number {
  return 1 - Math.min(0.2, BRACKET_TIMING.settle / Math.max(1e-3, ctx.approach))
}

/** Viscous decay 0 → 1 over u ∈ [0, 1]: fast start, never-zero slowing tail. */
function damped(u: number, k: number): number {
  return (1 - Math.exp(-k * u)) / (1 - Math.exp(-k))
}

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
    assemblingRing(R - W / 2, lerp(W * 0.5, W, k), ringTone(ctx.palette, wake), 2, outQuart(k), lerp(-TAU / 4, 0, k), 1, ringEdge()),
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

const HOLD_SIZE_EASE = cubicBezier(tokens.sizeCurve.hold.ease[0], 0, tokens.sizeCurve.hold.ease[1], 1)

/**
 * Size: one monotone ease from spawn to the hit size, landing with the
 * brackets (`bracketLandP`) — a single velocity hump, so growth and the
 * damped spin wind down together and the head is fully still before the
 * hit (a mid-way stall + re-acceleration overlapping the spin's slow-down
 * read as a wobble).
 */
export function holdSize(p: number, ctx: DrawContext): number {
  return lerp(tokens.sizeCurve.hold.spawn, 1, HOLD_SIZE_EASE(seg(p, 0, bracketLandP(ctx))))
}

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
    const { from, fadeTo, turns, damping } = BRACKET_TIMING
    const spin = -TAU * turns * (1 - damped(seg(p, from, bracketLandP(ctx)), damping))
    const lock = brackets(ctx, R * BRACKET.r, spin, ringTone(ctx.palette, wake), seg(p, from, fadeTo))
    return group([lock, head].filter(Boolean) as SceneNode[], { opacity: seg(p, 0, 0.08), transform: { scale: holdSize(p, ctx) } })
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
 * While held, the looping decorations come as two independent layers so a
 * skin can sandwich the body freely:
 *  - under (`holdLoopUnder`): two thin ripples, half a period apart, beyond
 *    the progress ring — drawn beneath the head.
 *  - over (`holdLoopOver`): the dark socket itself pings (Tailwind
 *    `animate-ping`): a copy of the core disc scales 1 → 2 and fades out over
 *    the first 75 % of each half period — the same rate as the outer ripples —
 *    ease ≈ cubic-bezier(0, 0, 0.2, 1). The glyph stays still on top. Drawn
 *    above the head.
 * Both are seamless over `holdLoop`.
 */
function holdLoopUnder(long: boolean) {
  return (t: number, ctx: DrawContext): SceneNode => {
    const R = ctx.size / 2
    const hair = ctx.unit * tokens.stroke.hair
    const P = tokens.time.holdLoop
    const u = (((t % P) + P) % P) / P
    const ripples: SceneNode[] = []
    for (let i = 0; i < 2; i++) {
      const v = (u + i / 2) % 1
      ripples.push(ring(R * lerp(PROGRESS_R + 0.12, long ? 2.05 : 1.85, outCubic(v)), hair * lerp(2.4, 0.6, v), ctx.palette[300], (1 - v) ** 1.5 * 0.85))
    }
    return group(ripples)
  }
}

function holdLoopOver(long: boolean) {
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
    const glyph = glyphShape(long, R * PRESSED * GLYPH, hair * 1.6 * PRESSED, ctx.palette.ring)
    return group([ping, glyph].filter(Boolean) as SceneNode[])
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
      lead > 0 ? arc(r, 0, TAU * lead, W, ctx.palette[50]) : null,
      done > 0 ? arc(r, 0, TAU * done, W, ctx.palette[500]) : null,
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
        ? 'Reads apart from a click: one smooth size ease, no overshoot, two lock brackets spin in on a heavy, viscous damping, landing on their rest pose ≈ 4 frames before the hit; size eases in on one long tail and lands with them. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); square glyph. Colours wake gently over p 0.3–0.85 (page cue).'
        : 'Reads apart from a click: one smooth size ease, no overshoot, two lock brackets spin in on a heavy, viscous damping, landing on their rest pose ≈ 4 frames before the hit; size eases in on one long tail and lands with them. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); circle glyph. Colours wake gently over p 0.3–0.85 (page cue).',
    },
    hold: {
      press: { id: 'hold-press', mode: 'once', duration: tokens.time.holdPress, draw: holdPress(long), note: 'Head sinks to 0.86; the lock brackets clamp onto the ring and merge into it.' },
      loopUnder: { id: 'hold-loop-under', mode: 'loop', duration: tokens.time.holdLoop, draw: holdLoopUnder(long), note: 'Two outer ripples pulse, half a period apart — drawn under the head so the body can be sandwiched between looping layers. Seamless.' },
      loopOver: { id: 'hold-loop-over', mode: 'loop', duration: tokens.time.holdLoop, draw: holdLoopOver(long), note: 'The dark socket pings (Tailwind-style scale 1→2 + fade) under the still glyph. Drawn above the head. Seamless.' },
      progress: { id: 'hold-progress', mode: 'progress', duration: 1, draw: holdProgress(long), note: 'Cytoid-style progress ring: 800 track, 50 lead at 4/3·p, 500 fill at p.' },
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
