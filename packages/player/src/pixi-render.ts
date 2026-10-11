import type { ClipShape, SceneNode, StrokeStyle, Transform } from '@cytoid/notes'
/**
 * PixiJS renderer for the scene graph — the live counterpart of
 * `render/canvas.ts`. Used by the playground player to draw clip output
 * directly, no baking involved.
 *
 * Sync strategy: `SceneView.setScene(node)` reuses the display tree between
 * frames. Groups map to Containers (transform/alpha/blend are property
 * writes), primitives map to Graphics that are only rebuilt when their
 * geometry/style signature changes. This keeps steady poses cheap and makes
 * animated arcs/dashes the only per-frame tessellation.
 */
import { Color, Container, Graphics } from 'pixi.js'

const colorCache = new Map<string, number>()

/** css color string → pixi number (memoised). */
export function pixiColor(css: string): number {
  let n = colorCache.get(css)
  if (n === undefined) {
    n = new Color(css).toNumber()
    colorCache.set(css, n)
  }
  return n
}

interface Entry {
  container: Container
  /** which display class `container` was created for */
  kind: 'group' | 'gfx'
  /** primitive signature at last rebuild (primitives only) */
  sig?: string
  /** mask graphics for groups with a clip */
  mask?: Graphics & { signatureKey?: string }
}

/** Per-container bookkeeping (one entry per scene child, positional). */
const entriesOf = new WeakMap<Container, Entry[]>()

function groupTransform(t?: Transform) {
  return {
    x: t?.x ?? 0,
    y: t?.y ?? 0,
    rotation: t?.rotate ?? 0,
    scaleX: (t?.scaleX ?? 1) * (t?.scale ?? 1),
    scaleY: (t?.scaleY ?? 1) * (t?.scale ?? 1),
  }
}

/** Geometry + style fingerprint (opacity/blend are synced as properties). */
function signature(n: Exclude<SceneNode, { type: 'group' }>): string {
  const s = 'strokeWidth' in n ? n : null
  const st = s && s.stroke
    ? `${s.stroke},${s.strokeWidth ?? 1},${s.cap ?? ''},${s.join ?? ''},${s.dash ? s.dash.join('+') : ''},${s.dashOffset ?? 0}`
    : ''
  switch (n.type) {
    case 'circle':
      return `c${n.cx ?? 0},${n.cy ?? 0},${n.r},${n.fill ?? ''},${st}`
    case 'arc':
      return `a${n.cx ?? 0},${n.cy ?? 0},${n.r},${n.start},${n.end},${st}`
    case 'rect':
      return `r${n.x},${n.y},${n.w},${n.h},${n.rx ?? 0},${n.fill ?? ''},${st}`
    case 'poly':
      return `p${n.points.map(p => `${p[0]},${p[1]}`).join(';')},${n.closed ? 1 : 0},${n.fill ?? ''},${st}`
    case 'line':
      return `l${n.x1},${n.y1},${n.x2},${n.y2},${st}`
  }
}

/** Build the clip shape as *filled* geometry — see `syncChildren`. */
function buildMaskShape(g: Graphics, c: ClipShape): void {
  if (c.type === 'circle')
    g.circle(c.cx ?? 0, c.cy ?? 0, c.r)
  else if (c.type === 'rect')
    g.roundRect(c.x, c.y, c.w, c.h, Math.min(c.rx ?? 0, c.w / 2, c.h / 2))
  else
    g.poly(c.points.flat(), true) // ClipShape polys are always closed
  // Pixi v8 renders Graphics masks through the graphics pipe: only fill
  // instructions create geometry, so a bare path masks everything out.
  g.fill(0xFFFFFF)
}

/**
 * Walk a dash pattern along a polyline, emitting one moveTo/lineTo pair per
 * dash. The phase follows the Canvas2D `lineDashOffset` convention (point at
 * distance d samples the pattern at `offset + d`) so output matches the
 * baked renderer.
 */
function dashedPath(g: Graphics, pts: [number, number][], closed: boolean, s: StrokeStyle) {
  const dash = s.dash!
  const pattern = dash.length % 2 ? [...dash, ...dash] : dash
  const period = pattern.reduce((a, b) => a + b, 0)
  if (period <= 0 || pts.length < 2)
    return
  const push = closed ? [...pts, pts[0]!] : pts
  // distance d samples the pattern at (offset + d) mod period
  let phase = ((s.dashOffset ?? 0) % period + period) % period
  let on = true
  let idx = 0
  let remain = pattern[0]!
  // fast-forward whole periods so huge offsets don't loop forever
  if (phase > 0) {
    while (phase >= remain) {
      phase -= remain
      idx = (idx + 1) % pattern.length
      remain = pattern[idx]!
      on = !on
    }
    remain -= phase
  }
  let drawing = false
  for (let i = 0; i + 1 < push.length; i++) {
    const [x1, y1] = push[i]!
    const [x2, y2] = push[i + 1]!
    let sx = x1
    let sy = y1
    const segLen = Math.hypot(x2 - x1, y2 - y1)
    if (segLen < 1e-9)
      continue
    let used = 0
    while (used < segLen - 1e-9) {
      const step = Math.min(remain, segLen - used)
      const nx = sx + (x2 - x1) * (step / segLen)
      const ny = sy + (y2 - y1) * (step / segLen)
      if (on) {
        if (!drawing) {
          g.moveTo(sx, sy)
          drawing = true
        }
        g.lineTo(nx, ny)
      }
      else {
        drawing = false
      }
      sx = nx
      sy = ny
      used += step
      remain -= step
      if (remain <= 1e-9) {
        idx = (idx + 1) % pattern.length
        remain = pattern[idx]!
        on = !on
      }
    }
  }
  void closed
}

function applyStroke(g: Graphics, s: StrokeStyle) {
  g.setStrokeStyle({
    width: s.strokeWidth ?? 1,
    color: pixiColor(s.stroke!),
    cap: s.cap ?? 'butt',
    join: s.join ?? 'miter',
  })
}

/** Sample an arc as a polyline (scene convention: 0 = up, clockwise, +y down). */
function arcPoints(n: Extract<SceneNode, { type: 'arc' }>): [number, number][] {
  const cx = n.cx ?? 0
  const cy = n.cy ?? 0
  const span = n.end - n.start
  const steps = Math.max(2, Math.ceil(Math.abs(span) / 0.2))
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const a = n.start + (span * i) / steps
    pts.push([cx + Math.sin(a) * n.r, cy - Math.cos(a) * n.r])
  }
  return pts
}

function drawPrimitive(g: Graphics, n: Exclude<SceneNode, { type: 'group' }>) {
  g.clear()
  const doStroke = (s: StrokeStyle) => {
    if (s.stroke && (s.strokeWidth ?? 1) > 0) {
      applyStroke(g, s)
      g.stroke()
    }
  }
  switch (n.type) {
    case 'circle':
      g.circle(n.cx ?? 0, n.cy ?? 0, Math.max(0, n.r))
      if (n.fill)
        g.fill(pixiColor(n.fill))
      doStroke(n)
      break
    case 'arc': {
      if (Math.abs(n.end - n.start) < 1e-4)
        break
      const path = arcPoints(n)
      applyStroke(g, n)
      if (n.dash)
        dashedPath(g, path, false, n)
      else
        path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      break
    }
    case 'rect':
      if (n.w > 0 && n.h > 0) {
        g.roundRect(n.x, n.y, n.w, n.h, Math.min(n.rx ?? 0, n.w / 2, n.h / 2))
        if (n.fill)
          g.fill(pixiColor(n.fill))
        doStroke(n)
      }
      break
    case 'poly':
      if (n.dash) {
        applyStroke(g, n)
        dashedPath(g, n.points, n.closed ?? false, n)
        g.stroke()
      }
      else {
        g.poly(n.points.flat(), n.closed ?? false)
        if (n.fill)
          g.fill(pixiColor(n.fill))
        doStroke(n)
      }
      break
    case 'line':
      applyStroke(g, n)
      if (n.dash) {
        dashedPath(g, [[n.x1, n.y1], [n.x2, n.y2]], false, n)
      }
      else {
        g.moveTo(n.x1, n.y1)
        g.lineTo(n.x2, n.y2)
      }
      g.stroke()
      break
  }
}

/** Recursively sync `parent`'s children to a scene node list. */
function syncChildren(parent: Container, nodes: SceneNode[]) {
  let entries = entriesOf.get(parent)
  if (!entries) {
    entries = []
    entriesOf.set(parent, entries)
  }
  // drop surplus entries
  while (entries.length > nodes.length) {
    const old = entries.pop()!
    old.mask?.destroy()
    old.container.destroy({ children: true })
  }
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!
    let e = entries[i]
    if (!e) {
      e = { kind: n.type === 'group' ? 'group' : 'gfx', container: n.type === 'group' ? new Container() : new Graphics() }
      entries.push(e)
      parent.addChild(e.container)
    }
    // swap display class if the node kind changed (rare)
    // (instanceof is useless here: pixi v8 Graphics extends Container)
    const wantKind = n.type === 'group' ? 'group' : 'gfx'
    if (e.kind !== wantKind) {
      const fresh = wantKind === 'group' ? new Container() : new Graphics()
      const idx = parent.children.indexOf(e.container)
      e.mask?.destroy()
      e.container.destroy({ children: true })
      e = { kind: wantKind, container: fresh }
      entries[i] = e
      parent.addChildAt(fresh, Math.max(0, idx))
    }
    const alpha = n.opacity ?? 1
    e.container.visible = alpha > 0.001
    e.container.alpha = alpha
    e.container.blendMode = n.blend === 'add' ? 'add' : 'normal'
    if (n.type === 'group') {
      const t = groupTransform(n.transform)
      e.container.position.set(t.x, t.y)
      e.container.rotation = t.rotation
      e.container.scale.set(t.scaleX, t.scaleY)
      if (n.clip) {
        const key = JSON.stringify(n.clip)
        if (!e.mask) {
          e.mask = new Graphics() as Graphics & { signatureKey?: string }
          e.container.addChild(e.mask)
        }
        // rebuild in place — the hold body's clip changes every frame while unrolling
        if (e.mask.signatureKey !== key) {
          e.mask.clear()
          buildMaskShape(e.mask, n.clip)
          e.mask.signatureKey = key
        }
        e.container.mask = e.mask
      }
      else if (e.mask) {
        e.container.mask = null
        e.mask.destroy()
        e.mask = undefined
      }
      syncChildren(e.container, n.children)
    }
    else {
      const g = e.container as Graphics
      const sig = signature(n)
      if (e.sig !== sig) {
        drawPrimitive(g, n)
        e.sig = sig
      }
    }
  }
}

/**
 * A display-object subtree that mirrors a scene node tree.
 *
 * ```ts
 * const view = new SceneView()
 * app.stage.addChild(view)
 * // each frame:
 * view.setScene(renderNote(kind, state, ctx))
 * ```
 */
export class SceneView extends Container {
  /** Replace the rendered scene. Passing `null` empties the view. */
  setScene(node: SceneNode | null) {
    syncChildren(this, node ? [node] : [])
  }

  /** Drop the whole subtree and its bookkeeping. */
  destroyView() {
    syncChildren(this, [])
    entriesOf.delete(this)
  }
}
