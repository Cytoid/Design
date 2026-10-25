/**
 * Context anchors — the named geometry constants a skin's value expressions
 * reference (`{ anchor: 'innerHalf' }`). This table is the exact contract the
 * C# interpreter's geometry provider must reproduce: everything derives from
 * the `DrawContext` alone, per draw call.
 *
 * Names mirror the imperative designs' locals (`R`, `W`, `inner`…). Kind
 * blocks add the constants only that family uses (the hold's approach-
 * dependent bracket landing time is a *time* anchor — see `landP`).
 */
import type { DrawContext } from '../notes/types'
import { tokens } from '../tokens'

/** Ring stroke for a note of this size (thinner on small notes). Mirrors the designs' `ringWidth`. */
function ringWidth(ctx: DrawContext): number {
  return ctx.unit * tokens.stroke.ring * (ctx.size / ctx.unit) ** 0.5
}

/** The hold brackets land `settle` seconds (≈ 4 frames @ 60 fps) before the hit — real time. */
const BRACKET_SETTLE = 4 / 60

export type AnchorTable = Record<string, number>

export function resolveAnchors(ctx: DrawContext): AnchorTable {
  const { unit, size, heading, approach } = ctx
  const R = size / 2
  const W = ringWidth(ctx)
  const hair = unit * tokens.stroke.hair
  const a: AnchorTable = {
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
    ringW: unit * tokens.stroke.ring,
  }
  switch (ctx.kind) {
    case 'hold':
    case 'long-hold': {
      // BRACKET_TIMING / holdSize / holdEnter / holdPress / holdLoop constants
      a.bracketR = R * 1.2
      a.bracketW = hair * 2.6
      a.landP = 1 - Math.min(0.2, BRACKET_SETTLE / Math.max(1e-3, approach))
      a.glyphW = hair * 1.6
      a.coreR = R * 0.6
      a.innerPressed = (R - W) * 0.86
      a.progressR = R * 1.34
      a.progressW = unit * 0.083
      // pressed-scale constants used by the loop clip (ping + glyph)
      a.pingR = R * 0.86 * 0.6
      a.loopGlyphR = R * 0.86 * 0.2
      a.loopGlyphW = hair * 1.6 * 0.86
      break
    }
    case 'flick': {
      // flickEnter constants — note: the flick strokes with the *unscaled* ring width
      const FW = unit * tokens.stroke.ring
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
