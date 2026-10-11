/**
 * Minimal, renderer-agnostic scene graph.
 *
 * Every note frame is described as a tree of a handful of flat primitives
 * (circle / arc / rect / polygon / line / group). This is intentionally the
 * same vocabulary a game engine can draw cheaply (Unity: SpriteShape,
 * LineRenderer, Shapes, UI Image + masks...), so the vector spec can be
 * ported 1:1, and the same tree is rasterised to bake frame animations.
 *
 * Coordinate system: origin = note centre, +x right, +y down, unit = px of
 * the design canvas (see `tokens.size`). Angles are radians, 0 = 12 o'clock,
 * clockwise positive.
 */

export interface Transform {
  x?: number
  y?: number
  /** radians, clockwise */
  rotate?: number
  scale?: number
  scaleX?: number
  scaleY?: number
}

export interface StrokeStyle {
  stroke?: string
  strokeWidth?: number
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
  /** dash array in px */
  dash?: number[]
  dashOffset?: number
}

export interface BaseNode {
  opacity?: number
  /** additive blending — used sparingly for hit flashes */
  blend?: 'normal' | 'add'
}

export interface CircleNode extends BaseNode, StrokeStyle {
  type: 'circle'
  cx?: number
  cy?: number
  r: number
  fill?: string
}

/** open arc, stroked only */
export interface ArcNode extends BaseNode, StrokeStyle {
  type: 'arc'
  cx?: number
  cy?: number
  r: number
  start: number
  end: number
}

export interface RectNode extends BaseNode, StrokeStyle {
  type: 'rect'
  x: number
  y: number
  w: number
  h: number
  rx?: number
  fill?: string
}

export interface PolyNode extends BaseNode, StrokeStyle {
  type: 'poly'
  points: [number, number][]
  closed?: boolean
  fill?: string
}

export interface LineNode extends BaseNode, StrokeStyle {
  type: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface GroupNode extends BaseNode {
  type: 'group'
  transform?: Transform
  /** optional clip (in group-local coordinates) */
  clip?: ClipShape
  children: SceneNode[]
}

export type ClipShape
  = | { type: 'circle', cx?: number, cy?: number, r: number }
    | { type: 'rect', x: number, y: number, w: number, h: number, rx?: number }
    | { type: 'poly', points: [number, number][] }

export type SceneNode = CircleNode | ArcNode | RectNode | PolyNode | LineNode | GroupNode

export function group(children: (SceneNode | false | null | undefined)[], opts: Omit<GroupNode, 'type' | 'children'> = {}): GroupNode {
  return { type: 'group', ...opts, children: children.filter(Boolean) as SceneNode[] }
}

/** Regular polygon points (first vertex at 12 o'clock, rotated by `rot`). */
export function regularPolygon(sides: number, r: number, rot = 0, cx = 0, cy = 0): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2
    pts.push([cx + Math.sin(a) * r, cy - Math.cos(a) * r])
  }
  return pts
}

/** Point on a circle using the scene angle convention (0 = up, clockwise). */
export function polar(r: number, a: number, cx = 0, cy = 0): [number, number] {
  return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]
}

/** Remove invisible nodes (opacity ~ 0 / empty groups) — keeps output small. */
export function prune(node: SceneNode): SceneNode | null {
  if ((node.opacity ?? 1) <= 0.001)
    return null
  if (node.type === 'group') {
    const children = node.children.map(prune).filter(Boolean) as SceneNode[]
    if (!children.length)
      return null
    return { ...node, children }
  }
  return node
}

/** Axis-aligned bounds of a scene (approximate: stroke width included). */
export function bounds(node: SceneNode): [number, number, number, number] | null {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]
  walk(node, [1, 0, 0, 1, 0, 0])
  return b[0] === Infinity ? null : b

  function add(m: Mat, x: number, y: number, pad: number) {
    const [a, bb, c, d, e, f] = m
    const px = a * x + c * y + e
    const py = bb * x + d * y + f
    const s = Math.hypot(a, bb) * pad
    b[0] = Math.min(b[0], px - s)
    b[1] = Math.min(b[1], py - s)
    b[2] = Math.max(b[2], px + s)
    b[3] = Math.max(b[3], py + s)
  }
  function walk(n: SceneNode, m: Mat) {
    if ((n.opacity ?? 1) <= 0.001)
      return
    const sw = 'strokeWidth' in n && n.stroke ? (n.strokeWidth ?? 1) / 2 : 0
    switch (n.type) {
      case 'circle':
      case 'arc': {
        const r = n.r + sw
        const cx = n.cx ?? 0
        const cy = n.cy ?? 0
        add(m, cx - r, cy - r, 0)
        add(m, cx + r, cy - r, 0)
        add(m, cx - r, cy + r, 0)
        add(m, cx + r, cy + r, 0)
        break
      }
      case 'rect':
        add(m, n.x, n.y, sw)
        add(m, n.x + n.w, n.y, sw)
        add(m, n.x, n.y + n.h, sw)
        add(m, n.x + n.w, n.y + n.h, sw)
        break
      case 'poly':
        for (const [x, y] of n.points) add(m, x, y, sw)
        break
      case 'line':
        add(m, n.x1, n.y1, sw)
        add(m, n.x2, n.y2, sw)
        break
      case 'group':
        for (const c of n.children) walk(c, mul(m, toMat(n.transform)))
        break
    }
  }
}

export type Mat = [number, number, number, number, number, number]

export function toMat(t?: Transform): Mat {
  if (!t)
    return [1, 0, 0, 1, 0, 0]
  const sx = (t.scaleX ?? 1) * (t.scale ?? 1)
  const sy = (t.scaleY ?? 1) * (t.scale ?? 1)
  const r = t.rotate ?? 0
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return [cos * sx, sin * sx, -sin * sy, cos * sy, t.x ?? 0, t.y ?? 0]
}

export function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}
