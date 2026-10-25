/**
 * Geometry and time inputs — the named geometry constants a skin's value expressions
 * reference (`{ input: 'innerHalf' }`). This table is the exact contract the
 * C# interpreter's geometry provider must reproduce: everything derives from
 * the `DrawContext` alone, per draw call.
 *
 * Names mirror the imperative designs' locals (`R`, `W`, `inner`…). Kind
 * blocks add the constants only that family uses (the hold's approach-
 * dependent bracket landing time is a time input — see `holdLanding`).
 */
import type { BodyOptions, DrawContext } from '../notes/types'

/** Ring stroke for a note of this size (thinner on small notes). Mirrors the designs' `ringWidth`. */
function ringWidth(ctx: DrawContext): number {
  return ctx.ringStroke * (ctx.size / ctx.unit) ** 0.5
}

/** The hold brackets land `settle` seconds (≈ 4 frames @ 60 fps) before the hit — real time. */
const BRACKET_SETTLE = 4 / 60

export type InputTable = Record<string, number>

export function resolveInputs(ctx: DrawContext): InputTable {
  const { unit, size, heading, approach } = ctx
  const R = size / 2
  const W = ringWidth(ctx)
  const hair = ctx.hairStroke
  const a: InputTable = {
    unit,
    size,
    heading,
    R,
    W,
    inner: R - W,
    ringC: R - W / 2,
    innerHalf: R - W * 1.5,
    hair,
    // unscaled ring stroke (`unit · ring`) — the judgement effects stroke with this
    ringW: ctx.ringStroke,
  }
  switch (ctx.kind) {
    case 'hold':
    case 'long-hold': {
      // BRACKET_TIMING / holdSize / holdEnter / holdPress / holdLoop constants
      a.bracketR = R * 1.2
      a.bracketW = hair * 2.6
      a.holdLanding = 1 - Math.min(0.2, BRACKET_SETTLE / Math.max(1e-3, approach))
      a.glyphW = hair * 1.6
      a.coreR = R * 0.6
      a.progressR = R * 1.34
      a.progressW = unit * 0.083
      break
    }
    case 'flick': {
      // flickEnter constants — note: the flick strokes with the *unscaled* ring width
      const FW = ctx.ringStroke
      const rv = R - FW * 0.7
      a.flickW = FW
      a.rv = rv
      a.flickInner = rv - FW * 1.1
      a.coreMax = rv - FW / Math.cos(Math.PI / 4)
      a.frameOuter = rv + FW / 2
      a.near = R * 0.98 + FW * 0.6
      a.nearFar = a.near + unit * 0.3
      a.approachNear = a.near + unit * 0.35
      a.arrowSize = R * 0.62
      a.arrowTip = a.arrowSize * 0.3
      a.arrowHalf = a.arrowSize * 0.6
      break
    }
  }
  return a
}

/** Fixed geometry and clock contract for parametric body slots. */
export function resolveBodyInputs(ctx: DrawContext, options: BodyOptions): InputTable {
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value)))
      throw new Error(`body input "${key}" must be finite`)
  }
  const isHold = ctx.kind === 'hold'
  if (isHold ? !('length' in options) : !('top' in options && 'bottom' in options))
    throw new Error(`${ctx.kind}: incorrect body geometry`)
  const geometry = 'length' in options ? [options.length] : [options.top, options.bottom]
  if (![options.progress, ...geometry].every(Number.isFinite))
    throw new Error('body geometry and progress must be finite')
  const elapsed = options.t ?? 0
  const duration = 'holdDuration' in options ? Math.max(0, options.holdDuration ?? 0) : 0
  const progress = Math.max(0, Math.min(1, options.progress))
  const collapseWindow = Math.min(0.6, duration)
  return {
    ...resolveInputs(ctx),
    ...('length' in options
      ? { length: Math.max(0, options.length) }
      : { top: Math.max(0, options.top), bottom: Math.max(0, options.bottom) }),
    appear: Math.max(0, Math.min(1, options.appear ?? 1)),
    progress,
    elapsed,
    duration,
    remaining: Math.max(0, duration - elapsed),
    bodyWidth: ctx.unit * 0.284,
    dashPeriod: Math.max(2, Math.round(ctx.unit * 0.284 * 1.1)),
    // Without a live duration (offline strips), retain the progress-sampled pose.
    collapse: duration > 0
      ? Math.max(0, Math.min(1, (elapsed - Math.max(0, duration - collapseWindow)) / collapseWindow))
      : Math.max(0, Math.min(1, (progress - 0.86) / (1 - 0.86))),
  }
}
