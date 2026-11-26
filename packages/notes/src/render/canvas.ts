import type { ClipShape, SceneNode, StrokeStyle, Transform } from '../core/scene'
import { TAU } from '../core/ease'

/** Structural subset of CanvasRenderingContext2D (works with OffscreenCanvas & node canvases). */
type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function applyTransform(ctx: Ctx2D, t?: Transform) {
  if (!t)
    return
  if (t.x || t.y)
    ctx.translate(t.x ?? 0, t.y ?? 0)
  if (t.rotate)
    ctx.rotate(t.rotate)
  const sx = (t.scaleX ?? 1) * (t.scale ?? 1)
  const sy = (t.scaleY ?? 1) * (t.scale ?? 1)
  if (sx !== 1 || sy !== 1)
    ctx.scale(sx, sy)
}

function stroke(ctx: Ctx2D, s: StrokeStyle) {
  if (!s.stroke || !(s.strokeWidth ?? 1))
    return
  ctx.strokeStyle = s.stroke
  ctx.lineWidth = s.strokeWidth ?? 1
  ctx.lineCap = s.cap ?? 'butt'
  ctx.lineJoin = s.join ?? 'miter'
  ctx.setLineDash(s.dash ?? [])
  ctx.lineDashOffset = s.dashOffset ?? 0
  ctx.stroke()
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  if (r <= 0) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function clipPath(ctx: Ctx2D, c: ClipShape) {
  ctx.beginPath()
  if (c.type === 'circle')
    ctx.arc(c.cx ?? 0, c.cy ?? 0, c.r, 0, TAU)
  else if (c.type === 'rect')
    roundRect(ctx, c.x, c.y, c.w, c.h, c.rx ?? 0)
  else c.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.clip()
}

/** Offscreen layers for isolated groups, one per nesting depth (reused across frames). */
const layers: (OffscreenCanvas | HTMLCanvasElement)[] = []
let layerDepth = 0

function layerCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  let c = layers[layerDepth]
  if (!c) {
    c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : document.createElement('canvas')
    layers[layerDepth] = c
  }
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}

/**
 * Isolated group: draw the children at full opacity into an offscreen layer
 * with the same device transform, then composite it once at `alpha`. The
 * target's current clip still applies to the final drawImage.
 */
function drawIsolated(ctx: Ctx2D, node: Extract<SceneNode, { type: 'group' }>, alpha: number) {
  const layer = layerCanvas(ctx.canvas.width, ctx.canvas.height)
  const l = layer.getContext('2d') as Ctx2D
  l.setTransform(1, 0, 0, 1, 0, 0)
  l.clearRect(0, 0, layer.width, layer.height)
  l.setTransform(ctx.getTransform())
  layerDepth++
  try {
    drawScene(l, { ...node, opacity: 1, blend: 'normal', isolate: false }, 1)
  }
  finally {
    layerDepth--
  }
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = alpha
  ctx.globalCompositeOperation = node.blend === 'add' ? 'lighter' : 'source-over'
  ctx.drawImage(layer, 0, 0)
  ctx.restore()
}

/** Draw a scene node. The caller sets up the origin (note centre). */
export function drawScene(ctx: Ctx2D, node: SceneNode, parentAlpha = 1, parentBlend: 'normal' | 'add' = 'normal'): void {
  const alpha = parentAlpha * (node.opacity ?? 1)
  if (alpha <= 0.001)
    return
  ctx.globalAlpha = alpha
  const blend = node.blend ?? parentBlend
  ctx.globalCompositeOperation = blend === 'add' ? 'lighter' : 'source-over'
  switch (node.type) {
    case 'image':
      if (node.image.disposed)
        throw new Error('skin image has been disposed')
      if (!node.image.source)
        throw new Error('Canvas image is not decoded; provide a decoder to loadSkinResources')
      if (node.w > 0 && node.h > 0)
        ctx.drawImage(node.image.source, node.x, node.y, node.w, node.h)
      break
    case 'circle':
      ctx.beginPath()
      ctx.arc(node.cx ?? 0, node.cy ?? 0, Math.max(0, node.r), 0, TAU)
      if (node.fill) {
        ctx.fillStyle = node.fill
        ctx.fill()
      }
      stroke(ctx, node)
      break
    case 'arc':
      if (Math.abs(node.end - node.start) < 1e-4)
        break
      ctx.beginPath()
      ctx.arc(node.cx ?? 0, node.cy ?? 0, node.r, node.start - Math.PI / 2, node.end - Math.PI / 2, node.end < node.start)
      stroke(ctx, node)
      break
    case 'rect':
      if (node.w <= 0 || node.h <= 0)
        break
      roundRect(ctx, node.x, node.y, node.w, node.h, node.rx ?? 0)
      if (node.fill) {
        ctx.fillStyle = node.fill
        ctx.fill()
      }
      stroke(ctx, node)
      break
    case 'poly':
      ctx.beginPath()
      node.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      if (node.closed)
        ctx.closePath()
      if (node.fill) {
        ctx.fillStyle = node.fill
        ctx.fill()
      }
      stroke(ctx, node)
      break
    case 'line':
      ctx.beginPath()
      ctx.moveTo(node.x1, node.y1)
      ctx.lineTo(node.x2, node.y2)
      stroke(ctx, node)
      break
    case 'group':
      if (node.isolate && alpha < 0.999) {
        drawIsolated(ctx, { ...node, blend }, alpha)
        break
      }
      ctx.save()
      applyTransform(ctx, node.transform)
      if (node.clip)
        clipPath(ctx, node.clip)
      for (const c of node.children) drawScene(ctx, c, alpha, blend)
      ctx.restore()
      break
  }
}
