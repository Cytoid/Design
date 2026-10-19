/**
 * FLICK (1.125) — diamond + two outward chevrons.
 *
 * Enter:
 *  0.00–0.45  diamond outline draws itself (4 edges grow from the vertices)
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
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { cubicBezier, lerp, outCubic, outQuart, seg } from '../core/ease'
import { group, regularPolygon } from '../core/scene'
import { ringTone } from '../palette'
import { tokens } from '../tokens'
import { BLINK_PEAK, blinkAmount, CLICK_TIMING, clickSize, coreGrowth, frameThickening, splitShades } from './click'
import { makeClearClips, makeExitClip } from './effects'
import { diamond, flickChevron } from './parts'

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
 * Diamond outline drawn edge by edge; k ∈ [0,1]. `edge` = dark keyline on the
 * band's outer edge (flat overlap separator, `tokens.stroke.edge`): for a
 * stroked square the centreline shifts outward by (width−e)/2 along the edge
 * normal — i.e. (width−e)/(2·cos 45°) per vertex radius — so the keyline's
 * outer boundary (miter tips included) coincides with the white band's.
 */
function buildingDiamond(r: number, width: number, color: string, k: number, edge?: { color: string, fraction: number }): SceneNode {
  const band = (rr: number, w: number, c: string): SceneNode => {
    if (k >= 0.999)
      return diamond(rr, { stroke: c, strokeWidth: w })
    const pts = regularPolygon(4, rr)
    const lines: SceneNode[] = []
    for (let i = 0; i < 4; i++) {
      const [x1, y1] = pts[i]!
      const [x2, y2] = pts[(i + 1) % 4]!
      // each edge grows from its midpoint toward both vertices
      const mx = (x1 + x2) / 2
      const my = (y1 + y2) / 2
      lines.push({ type: 'line', x1: lerp(mx, x1, k), y1: lerp(my, y1, k), x2: lerp(mx, x2, k), y2: lerp(my, y2, k), stroke: c, strokeWidth: w, cap: 'square' })
    }
    return group(lines)
  }
  const e = edge ? width * Math.min(1, Math.max(0, edge.fraction)) : 0
  if (!edge || !(e > 0))
    return band(r, width, color)
  return group([band(r, width, color), band(r + (width - e) / (2 * Math.cos(Math.PI / 4)), e, edge.color)])
}

function flickEnter(p: number, ctx: DrawContext): SceneNode {
  const R = ctx.size / 2
  const W = ctx.unit * tokens.stroke.ring
  // diamond vertex radius such that the outline fits the note box
  const rv = R - W * 0.7
  const inner = rv - W * 1.1
  const a = outCubic(seg(p, 0, 0.12))
  const build = outQuart(seg(p, 0, 0.45))

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
  // the keyline band (shifted by (width−e)/2cos45° inside `buildingDiamond`)
  // stays pinned with it
  const thick = frameThickening(p)
  const fw = lerp(W * 0.45, W, build) * thick
  const fr = rv - ((thick - 1) * W) / (2 * Math.cos(Math.PI / 4))
  // the core rises exactly onto the thickened frame's inner edge: a core
  // diamond with vertex radius rv − √2·W has its edges on that boundary
  const coreMax = rv - W / Math.cos(Math.PI / 4)
  // the settled chevrons are note material: they ride the ring's neutral wake;
  // the late approach pair is a timing gauge and stays at the resting tone
  const arrows = group(pair(x, W * 0.85, ringTone(ctx.palette, split.k)), { opacity: arrowOpacity })
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
    buildingDiamond(fr, fw, ringTone(ctx.palette, split.k), build, { color: tokens.edge, fraction: tokens.stroke.edge }),
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
    note: 'Diamond outline grows from edge midpoints; dim pre-roll and late core with a double blink (as Click) on Click\'s fitted size curve; chevrons dash in late (fade 0.32–0.45) on a short 0.30u flight over 0.25–0.5, overshooting ~16 px past rest (deepest ~p 0.5) and relaxing back across the diamond\'s growth so the body–arrow gap only closes; locked from p 0.875; from p 0.7 the outline thickens inward by half a stroke width (Click\'s frame thickening) onto the core risen to its inner edge — the two coincide exactly at the hit. Outline and chevrons wake neutral 400 → 50 with the split.',
  },
  clear: makeClearClips({ shape: 'diamond', reach: 1.4, sectors: 4, extra: 'streaks', seed: 2 }),
  exit: makeExitClip(flickEnter),
}
