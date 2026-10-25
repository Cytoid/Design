import type { DragLineOptions, DrawContext, HoldBodyOptions, LongHoldBodyOptions, NoteSkin, SceneNode } from '@cytoid/notes'
import { clamp01, lerp } from '@cytoid/notes'
import { designs } from './render'
import { tokens } from './tokens'

/** Fixed strip period shared by live bodies and offline tiling. */
export function holdDashPeriod(ctx: DrawContext): number {
  return Math.max(2, Math.round(ctx.unit * tokens.stroke.holdBody * 1.1))
}

export function holdBody(options: HoldBodyOptions, ctx: DrawContext, skin: NoteSkin = designs): SceneNode {
  return skin.hold.body!.draw(options, ctx)
}

export function longHoldBody(options: LongHoldBodyOptions, ctx: DrawContext, skin: NoteSkin = designs): SceneNode {
  return skin['long-hold'].body!.draw(options, ctx)
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
