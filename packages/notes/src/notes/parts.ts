/**
 * Reusable flat building blocks. Each returns plain scene nodes; nothing
 * here knows about note kinds.
 */
import type { SceneNode } from '../core/scene'
import { lerp, outCubic, outQuart, rng, seg, TAU } from '../core/ease'
import { group, polar, regularPolygon } from '../core/scene'

export function disk(r: number, fill: string, opacity = 1): SceneNode {
  return { type: 'circle', r: Math.max(0, r), fill, opacity }
}

export function ring(r: number, width: number, stroke: string, opacity = 1): SceneNode {
  return { type: 'circle', r: Math.max(0, r), stroke, strokeWidth: width, opacity }
}

export function arc(r: number, start: number, end: number, width: number, stroke: string, opts: { opacity?: number, cap?: 'butt' | 'round' } = {}): SceneNode {
  return { type: 'arc', r, start, end, strokeWidth: width, stroke, cap: opts.cap ?? 'butt', opacity: opts.opacity }
}

/**
 * Ring assembled from `n` equal arcs that grow from their own centre.
 * `k` = 0 → nothing, 1 → closed ring. `spin` rotates the whole set.
 *
 * `edge` draws a dark keyline over the outer fraction of the band (see
 * `tokens.stroke.edge`) — the flat overlap separator. The band is split,
 * not widened: the keyline rides the band's outer edge (centreline shifted
 * out by (width−e)/2) so the silhouette is unchanged, and it shares the
 * assembly motion — no second envelope.
 */
export function assemblingRing(
  r: number,
  width: number,
  stroke: string,
  n: number,
  k: number,
  spin = 0,
  opacity = 1,
  edge?: { color: string, fraction: number },
): SceneNode {
  const closed = k >= 0.999
  const span = TAU / n
  const half = (span * k) / 2
  const band = (rr: number, w: number, color: string): SceneNode =>
    closed
      ? ring(rr, w, color, opacity)
      : group(
          Array.from({ length: n }, (_, i) => {
            const c = spin + i * span
            return arc(rr, c - half, c + half, w, color)
          }),
          { opacity },
        )
  const e = edge ? width * Math.min(1, Math.max(0, edge.fraction)) : 0
  if (!edge || !(e > 0))
    return band(r, width, stroke)
  return group([band(r, width, stroke), band(r + (width - e) / 2, e, edge.color)])
}

/** Dashed ring made of `n` dashes, duty in (0, 1]. */
export function dashedRing(r: number, width: number, stroke: string, n: number, duty: number, spin = 0, opacity = 1): SceneNode {
  return assemblingRing(r, width, stroke, n, duty, spin, opacity)
}

/** Short radial tick at angle `a`, from radius r0 to r1. */
export function tick(a: number, r0: number, r1: number, width: number, stroke: string, opacity = 1): SceneNode {
  const [x1, y1] = polar(r0, a)
  const [x2, y2] = polar(r1, a)
  return { type: 'line', x1, y1, x2, y2, stroke, strokeWidth: width, cap: 'butt', opacity }
}

/**
 * Sharp-cornered diamond (square rotated 45°) — `r` = centre-to-vertex. Miter joins so a
 *  stroked outline matches the square-capped segments that build it (no corner pop at the
 *  end of the flick's edge-by-edge assembly).
 */
export function diamond(r: number, style: { fill?: string, stroke?: string, strokeWidth?: number, opacity?: number }): SceneNode {
  return { type: 'poly', points: regularPolygon(4, r), closed: true, join: 'miter', ...style }
}

/** Horizontal capsule centred at origin. */
export function capsule(w: number, h: number, style: { fill?: string, stroke?: string, strokeWidth?: number, opacity?: number }): SceneNode {
  return { type: 'rect', x: -w / 2, y: -h / 2, w, h, rx: h / 2, ...style }
}

/** Chevron "^" pointing up, centred, size = width. */
export function chevron(size: number, width: number, stroke: string, opacity = 1): SceneNode {
  const h = size * 0.5
  return {
    type: 'poly',
    points: [[-size / 2, h / 2], [0, -h / 2], [size / 2, h / 2]],
    stroke,
    strokeWidth: width,
    join: 'miter',
    cap: 'butt',
    opacity,
  }
}

/**
 * Flick chevron ">" with its tip at (x, 0). Opening angle is 90° — the same as
 * the flick diamond's corner — and it is shared by the note and its clear
 * effect so the angle never changes. `h` = half height (= depth).
 */
export function flickChevron(x: number, h: number, width: number, color: string, opacity = 1): SceneNode {
  return { type: 'poly', points: [[x - h, -h], [x, 0], [x - h, h]], stroke: color, strokeWidth: width, join: 'miter', opacity }
}

/** Solid arrow head (filled triangle-chevron, Cytoid CDragFill style). */
export function arrowHead(size: number, fill: string, opacity = 1): SceneNode {
  const s = size / 2
  return {
    type: 'poly',
    closed: true,
    points: [[0, -s], [s * 0.82, s * 0.78], [0, s * 0.3], [-s * 0.82, s * 0.78]],
    fill,
    join: 'round',
    opacity,
  }
}

/* ------------------------------------------------------------------ */
/* Effects                                                              */
/* ------------------------------------------------------------------ */

export interface ShardOptions {
  count: number
  seed: number
  /** start radius */
  r0: number
  /** max travel radius */
  r1: number
  size: number
  color: string
  /** 0..1 local time */
  u: number
  /** restrict emission to these angle ranges (radians) */
  sectors?: [number, number][]
  shape?: 'square' | 'bar'
}

/** Square confetti flying out radially, decelerating and shrinking. Deterministic. */
export function shards(o: ShardOptions): SceneNode {
  const rand = rng(o.seed)
  const items: SceneNode[] = []
  for (let i = 0; i < o.count; i++) {
    let a: number
    if (o.sectors) {
      const s = o.sectors[i % o.sectors.length]!
      a = lerp(s[0], s[1], rand())
    }
    else {
      a = ((i + rand() * 0.8) / o.count) * TAU
    }
    const reach = lerp(0.55, 1, rand())
    const delay = rand() * 0.12
    const life = lerp(0.55, 0.86, rand())
    const k = seg(o.u, delay, delay + life)
    if (k <= 0 || k >= 1)
      continue
    const d = lerp(o.r0, o.r0 + (o.r1 - o.r0) * reach, outQuart(k))
    const [x, y] = polar(d, a)
    const s = o.size * lerp(0.6, 1.2, rand()) * (1 - outCubic(seg(k, 0.35, 1)))
    if (o.shape === 'bar') {
      const [x2, y2] = polar(d + s * 2.4, a)
      items.push({ type: 'line', x1: x, y1: y, x2, y2, stroke: o.color, strokeWidth: s * 0.55, cap: 'butt' })
    }
    else {
      items.push(group([{ type: 'rect', x: -s / 2, y: -s / 2, w: s, h: s, fill: o.color }], {
        transform: { x, y, rotate: a + k * 2.2 * (rand() > 0.5 ? 1 : -1) },
      }))
    }
  }
  return group(items)
}
