/**
 * Engine-side pure helpers shared by the live renderer, the player and the
 * legacy golden oracle (test/golden/legacy). The note draw code itself is
 * data-driven now (see `../skin`) — these survive because consumers outside
 * the skin still call them.
 */
import type { DrawContext } from './types'
import { tokens } from '../tokens'

/** Ring stroke for a note of this size (thinner on small notes). */
export function ringWidth(ctx: DrawContext): number {
  return ctx.unit * tokens.stroke.ring * (ctx.size / ctx.unit) ** 0.5
}

/** One exit fade curve (see `tokens.time.exit`). */
export interface ExitCurve { duration: number, drop: number, fall: number, power: number }

/**
 * Exit opacity: drop − fall · p^power over the curve's duration,
 * clamped, 0 from the end. t = seconds since the chart hit time; 1 before it.
 * The default (`tap`) steps from 1 to 0.8 the moment the hit time passes — a
 * discrete "you're late" cue — then falls as 0.8 − p³, readable through the
 * hit window and gone at ≈ 0.93 of it.
 */
export function exitAlpha(t: number, curve: ExitCurve = tokens.time.exit.tap): number {
  if (t < 0)
    return 1
  const p = t / curve.duration
  return p >= 1 ? 0 : Math.max(0, curve.drop - curve.fall * p ** curve.power)
}
