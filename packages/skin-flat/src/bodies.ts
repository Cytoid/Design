import type { ChainLinkOptions, DrawContext, HoldBodyOptions, LongHoldBodyOptions, NoteSkin, SceneNode } from '@cytoid/notes'
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
 * One chain link's raw template, along +y from the source note toward the
 * next node (spanning 0..length). Callers rotate it onto the link and clip it
 * to the engine's lead/trail window — growth and retraction never reach the
 * skin. Null when the context kind carries no chain-link design.
 */
export function chainLink(options: ChainLinkOptions, ctx: DrawContext, skin: NoteSkin = designs): SceneNode | null {
  return skin[ctx.kind].chainLink?.draw(options, ctx) ?? null
}
