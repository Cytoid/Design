/**
 * FLICK (1.125) — diamond + two outward chevrons.
 *
 * Enter:
 *  0.00–0.12  fade in; the diamond outline is complete from the first frame —
 *             the entrance is carried by the fade, the S-curve size and the
 *             shade wake alone
 *  0.25–0.94  shade split + late (ease-in) core, as Click; 0.86–0.89 + 0.92–1 double blink
 *  0.25–0.88  chevrons dash in on the body's S-curve (`riseSettleCurve`):
 *             a short 0.30u flight over 0.25–0.5, overshooting ~16 px past
 *             rest (deepest ~p 0.5, just after the old stop point); the
 *             relax back spans the diamond's whole growth, so the
 *             body–arrow gap only ever closes — the pairs sit locked
 *             from 0.875 through the hit
 *  0.70–1.00  a fainter approach chevron pair converges linearly onto them (Click's approach ring)
 *  0.70–1.00  the outline thickens inward by half a stroke width (Click's frame
 *             thickening, outer edge pinned) while the core has risen onto its
 *             final inner edge — core and frame coincide exactly at p = 1
 *  0.00–1.00  the diamond body plays Click's fitted S-curve (`tokens.sizeCurve.click`)
 */
import type { DrawContext, NoteDesign, SceneNode } from '@cytoid/notes'

import type { EdgeSpec } from './parts'
import { cubicBezier, group, lerp, outCubic, ringTone, seg } from '@cytoid/notes'
import { tokens } from '@cytoid/skin-flat'
import { BLINK_PEAK, blinkAmount, CLICK_TIMING, clickSize, coreGrowth, frameThickening, ringStep, splitShades } from './click'
import { makeClearClips, makeExitClip } from './effects'
import { diamond, edgeBands, flickChevron, ringEdge } from './parts'

/**
 * Flight window of the side arrows: a delayed, short 0.30u dash over
 *  0.25–0.5; the slow S-curve ramp happens mostly before the fade-in
 *  (0.32–0.45).
 */
const ARROW_FROM = 0.25
/**
 * Same rise–settle language as the body (`tokens.sizeCurve.s`), anchored to
 *  the arrow's own windows: rise 0.25–0.5 to ~16 px past rest (peak fraction
 *  1.42 over the short 0.30u travel — same deepest point as ever), relax
 *  0.5–0.875 spanning the diamond's growth, so the body swells faster than
 *  the arrows retreat and the gap only closes; locked from 0.875.
 */
const ARROW_SHAPE = cubicBezier(tokens.sizeCurve.s[0], 0, tokens.sizeCurve.s[1], 1)
function arrowTravel(p: number): number {
  if (p < ARROW_FROM)
    return 0
  if (p < 0.5)
    return lerp(0, 1.42, ARROW_SHAPE(seg(p, ARROW_FROM, 0.5)))
  if (p < 0.875)
    return lerp(1.42, 1, ARROW_SHAPE(seg(p, 0.5, 0.875)))
  return 1
}

function flickArrow(size: number, width: number, color: string): SceneNode {
  // ">" pointing right, 90° like the diamond corner
  return flickChevron(size * 0.3, size * 0.6, width, color)
}

/**
 * Closed diamond outline. `edge` = stepped dark falloff on the band's outer
 * silhouette (flat overlap separator, `tokens.stroke.edge`, `edgeBands`): a
 * band whose centreline sits `offset` from the silhouette along the edge
 * normal has vertex radius r + (width/2 + offset)/cos 45°, so every band's
 * boundaries (miter tips included) stay parallel to the white band's.
 */
function edgedDiamond(r: number, width: number, color: string, edge?: EdgeSpec): SceneNode {
  const bands = edgeBands(width, edge)
  if (!bands.length)
    return diamond(r, { stroke: color, strokeWidth: width })
  const c45 = Math.cos(Math.PI / 4)
  return group([diamond(r, { stroke: color, strokeWidth: width }), ...bands.map(b => diamond(r + (width / 2 + b.offset) / c45, { stroke: edge!.color, strokeWidth: b.width, opacity: b.opacity }))])
}

function flickEnter(p: number, ctx: DrawContext): SceneNode {
  const R = ctx.size / 2
  const W = ctx.unit * tokens.stroke.ring
  // diamond vertex radius such that the outline fits the note box
  const rv = R - W * 0.7
  const inner = rv - W * 1.1
  const a = outCubic(seg(p, 0, 0.12))

  const near = R * 0.98 + W * 0.6
  const far = near + ctx.unit * 0.3
  // delayed half-length dash at full speed (see `arrowTravel`, `ARROW_FROM`)
  const x = lerp(far, near, arrowTravel(p))
  const arrowSize = R * 0.62
  const arrowOpacity = outCubic(seg(p, 0.32, 0.45))
  const pair = (px: number, width: number, color: string) => [
    group([flickArrow(arrowSize, width, color)], { transform: { x: px } }),
    group([flickArrow(arrowSize, width, color)], { transform: { x: -px, rotate: Math.PI } }),
  ]
  // same timing language as Click: dim pre-roll, the core swells late
  const g = coreGrowth(p)
  const blink = blinkAmount(p)
  const split = splitShades(p, ctx)
  // frame thickening (as Click): outer edge pinned at the outline's original
  // outer boundary — the centreline shifts inward by (thick−1)·W/2cos45°, and
  // the keyline band (shifted by (width−e)/2cos45° inside `edgedDiamond`)
  // stays pinned with it
  const thick = frameThickening(p)
  const fw = W * thick
  const fr = rv - ((thick - 1) * W) / (2 * Math.cos(Math.PI / 4))
  // the core rises exactly onto the thickened frame's inner edge: a core
  // diamond with vertex radius rv − √2·W has its edges on that boundary
  const coreMax = rv - W / Math.cos(Math.PI / 4)
  // the settled chevrons are note material: they ride the ring's wake;
  // the late approach pair is a timing gauge and stays at the resting tone
  const arrows = group(pair(x, W * 0.85, ringTone(ctx.palette, ringStep(p))), { opacity: arrowOpacity })
  // approach chevrons (a second, thinner gauge pair): the flick's approach
  // ring — converge linearly onto the settled pair over the last 30 %
  const ap = seg(p, CLICK_TIMING.approachFrom, 1)
  const approach = ap > 0 && ap < 1
    ? group(pair(lerp(near + ctx.unit * 0.35, near, ap), W * 0.6, ctx.palette.ring), { opacity: 0.5 * seg(ap, 0, 0.15) })
    : null
  const body = group([
    diamond(inner + W * 0.15, { fill: split.base }),
    // fades in with the shade split (same stacking artifact as the click core otherwise)
    split.k > 0 ? diamond(coreMax * g, { fill: split.core, opacity: split.k }) : null,
    blink > 0 ? diamond(coreMax * g, { fill: ctx.palette.ring, opacity: BLINK_PEAK * blink }) : null,
    // centre slit: flat nod to Cytoid's split-diamond flick fill
    { type: 'line', x1: 0, y1: -inner * 0.5 * g, x2: 0, y2: inner * 0.5 * g, stroke: ctx.palette[600], strokeWidth: W * 0.5, opacity: outCubic(seg(p, CLICK_TIMING.splitFrom, 0.75)) },
    edgedDiamond(fr, fw, ringTone(ctx.palette, ringStep(p)), ringEdge()),
  ].filter(Boolean) as SceneNode[], { transform: { scale: clickSize(p) } })

  return group([approach, arrows, body].filter(Boolean) as SceneNode[], { opacity: a })
}

export const flick: NoteDesign = {
  kind: 'flick',
  enter: {
    id: 'enter',
    mode: 'normalized',
    duration: tokens.time.enter,
    draw: flickEnter,
    note: 'Dim pre-roll and late core with a double blink (as Click) on Click\'s fitted size curve; the diamond outline is complete from the first frame (no assembly); chevrons dash in late (fade 0.32–0.45) on a short 0.30u flight over 0.25–0.5, overshooting ~16 px past rest (deepest ~p 0.5) and relaxing back so the body–arrow gap only closes; locked from p 0.875; from p 0.7 the outline thickens inward by half a stroke width (Click\'s frame thickening) onto the core risen to its inner edge — the two coincide exactly at the hit. Outline and chevrons enter darker (band 800 → 400 over 0–0.4, the old assembly slot), then wake 400 → resting on the shared gentle ring wake.',
  },
  clear: makeClearClips({ shape: 'diamond', reach: 1.4, sectors: 4, extra: 'streaks', seed: 2 }),
  exit: makeExitClip(flickEnter),
}
