/**
 * DRAG family. Players follow the *path*, not the tap timing. The size no
 * longer holds a custom steady-by-p-0.2 phase: head and child follow their
 * own fitted S-curves (`tokens.sizeCurve.dragHead` / `.dragChild`) —
 * a small spawn, one smooth slow-fast-slow growth into the +5 % / +3 %
 * peak at p 0.77, settled back to exactly 1.0 from p 0.87 / 0.85. Only the
 * shades wake WAKE_DROP steps up (600 → 400) on the palette scale over the
 * click's WAKE window (page cue).
 *
 * Drag head (0.8): neutral ring + full fill + matching arrow pointing along the
 *   chain (`ctx.heading`; frames are baked pointing up — rotate the sprite).
 * Drag child (0.65): solid bead, like Cytoid. Only a faint 600 hairline ring.
 * Click drag head: Click curve + the same arrow (see click.ts).
 * Click drag child: identical to drag child, click colours.
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { lerp, outCubic, riseSettleCurve, seg, TAU } from '../core/ease'
import { group } from '../core/scene'
import { ringTone, tone } from '../palette'
import { tokens } from '../tokens'
import { dragArrow, ringWidth, wakeAmount, wakeShade } from './click'
import { makeClearClips, makeMissClip } from './effects'
import { assemblingRing, disk, ring } from './parts'

/** steady by this p */
const STEADY = 0.2

/**
 * Enter size at progress `p` (1 = hit pose): one fitted S-curve per phase
 * (see `tokens.sizeCurve`) — spawn 0.29 / 0.26, continuous growth into the
 * +5 % / +3 % peak at p 0.77, settled back to exactly 1.0 from p 0.87 / 0.85.
 */
export const dragHeadSize = riseSettleCurve(tokens.sizeCurve.dragHead, tokens.sizeCurve.s)
export const dragChildSize = riseSettleCurve(tokens.sizeCurve.dragChild, tokens.sizeCurve.s)

function headDraw(p: number, ctx: DrawContext): SceneNode {
  const R = ctx.size / 2
  const W = ringWidth(ctx)
  const k = outCubic(seg(p, 0, STEADY))
  const w = wakeAmount(p)
  return group([
    disk(R - W + 0.5, tone(ctx.palette, wakeShade(400, w))),
    dragArrow(ctx, (R - W) * 0.95, outCubic(seg(p, STEADY * 0.3, STEADY)), w),
    // ring + arrow are white material: they wake neutral 400 → 50 with the page cue
    assemblingRing(R - W / 2, W, ringTone(ctx.palette, w), 2, k, lerp(-TAU / 4, 0, k), 1, { color: tokens.edge, fraction: tokens.stroke.edge }),
  ].filter(Boolean) as SceneNode[], { opacity: seg(p, 0, 0.06), transform: { scale: dragHeadSize(p) } })
}

export const dragHead: NoteDesign = {
  kind: 'drag-head',
  enter: {
    id: 'enter',
    mode: 'normalized',
    duration: tokens.time.enter,
    note: 'Fitted S-curve: small spawn, smooth growth into the +5 % peak at p 0.77, settled from p 0.87. Ring closes from 2 halves by p 0.2, arrow along the chain (rotate by heading); ring + arrow wake neutral 400 → 50 over the WAKE window. Path matters, not timing.',
    draw: headDraw,
  },
  clear: makeClearClips({ shape: 'circle', reach: 1.4, sectors: 24, seed: 5 }),
  miss: makeMissClip('circle'),
}

/**
 * Solid bead — like Cytoid's drag child. The only inner decoration is a
 * low-contrast 600 hairline ring, so the centre never draws the eye and
 * the node position stays crisp.
 */
function childDraw(p: number, ctx: DrawContext): SceneNode {
  const R = ctx.size / 2
  const k = outCubic(seg(p, 0, STEADY))
  const w = wakeAmount(p)
  return group([
    disk(R, tone(ctx.palette, wakeShade(400, w))),
    ring(R * 0.62, ctx.unit * tokens.stroke.hair, tone(ctx.palette, wakeShade(600, w)), 0.7 * k),
  ], { opacity: seg(p, 0, 0.06), transform: { scale: dragChildSize(p) } })
}

/** Miss ghost in the child's own end pose: bead + 600 hairline ring, no outer ring. */
function childMissGhost(ctx: DrawContext, R: number, _W: number, k: number): SceneNode[] {
  return [
    disk(R * lerp(0.92, 0.75, k), ctx.palette[800], 0.9),
    ring(R * 0.62 * lerp(1, 0.78, k), ctx.unit * tokens.stroke.hair * lerp(1, 0.6, k), ctx.palette[600], 0.7),
  ]
}

export const dragChild: NoteDesign = {
  kind: 'drag-child',
  enter: { id: 'enter', mode: 'normalized', duration: tokens.time.enter, draw: childDraw, note: 'Solid bead (Cytoid), faint 600 hairline ring, fitted S-curve.' },
  clear: makeClearClips({ shape: 'circle', reach: 1.4, sectors: 24, seed: 6 }),
  miss: makeMissClip('circle', childMissGhost),
}

export const clickDragChild: NoteDesign = {
  kind: 'click-drag-child',
  enter: { id: 'enter', mode: 'normalized', duration: tokens.time.enter, draw: childDraw, note: 'Same as drag child, click colours.' },
  clear: makeClearClips({ shape: 'circle', reach: 1.4, sectors: 24, seed: 7 }),
  miss: makeMissClip('circle', childMissGhost),
}
