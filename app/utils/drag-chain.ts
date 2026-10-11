import type { Direction, Grade, NoteKind, Palette } from '@cytoid/notes'
import { clamp01, createContext, dragLine, drawScene, renderNote, tokens } from '@cytoid/notes'

/**
 * Scanline recipe shared by the gallery cards, hero stage and drag chains:
 * 1.5px line, 6px caps.
 */
export function drawScanline(ctx: CanvasRenderingContext2D, width: number, scanY: number) {
  ctx.fillStyle = '#e1e5f5'
  ctx.fillRect(-width / 2, scanY - 0.75, width, 1.5)
  ctx.fillRect(-width / 2, scanY - 3, 6, 6)
  ctx.fillRect(width / 2 - 6, scanY - 3, 6, 6)
}

export interface DragChainOptions {
  width: number
  height: number
  elapsed: number
  kind: NoteKind
  direction: Direction
  grade: Grade
  scale: number
  judgement: boolean
  palette: Palette
}

/**
 * Drag kinds tell their story with a three-node chain. The focused node stays
 * horizontally centred: the head card lays the chain out 中右中 (centre → right
 * → centre, a zigzag that doubles back), a child card 左中右 (head left, focus
 * centre, next child right). Every node is judged when the scanline crosses its
 * lane — so the node times fall straight out of the geometry — and the head
 * keeps sliding along the chain after its own hit, its burst left at the
 * trigger point (Cytoid chain-follow).
 */
export function paintDragChain(ctx: CanvasRenderingContext2D, opts: DragChainOptions) {
  const { width, height, elapsed } = opts
  const up = opts.direction === 'up'
  const click = opts.kind.startsWith('click-')
  const headKind = click ? 'click-drag-head' : 'drag-head'
  const childKind = click ? 'click-drag-child' : 'drag-child'
  const focusHead = opts.kind.endsWith('head')
  const step = up ? -1 : 1
  const near = height / 2
  // taller than it is wide: the chain reads as a vertical zigzag
  const spreadX = width * 0.16
  const stepY = 64
  const nodes = focusHead
    ? [{ x: 0, y: 0 }, { x: spreadX, y: step * stepY }, { x: 0, y: step * stepY * 2 }]
    : [{ x: -spreadX, y: -step * stepY / 2 }, { x: 0, y: 0 }, { x: spreadX, y: step * stepY / 2 }]
  const kinds: NoteKind[] = [headKind, childKind, childKind]
  const hits = nodes.map(n => 1.5 * (near - n.y * (up ? 1 : -1)) / near)
  const clearDur = tokens.time.clear[opts.grade]
  const t = elapsed % (hits[2]! + clearDur + 0.35)
  ctx.translate(width / 2, height / 2)
  const base = { palette: opts.palette, direction: opts.direction, scale: opts.scale }
  const headingTo = (a: { x: number, y: number }, b: { x: number, y: number }) => Math.atan2(b.x - a.x, -(b.y - a.y))
  // connections grow toward the next node (arriving ~1s before its judgement,
  // like Cytoid's DragLineElement) and retract behind it after the source is hit
  for (let i = 0; i < 2; i++) {
    const lead = clamp01((t - (hits[i]! - 1.233)) / ((hits[i + 1]! - 0.968) - (hits[i]! - 1.233)))
    const trail = clamp01((t - hits[i]!) / (hits[i + 1]! - hits[i]!))
    const line = dragLine({ x1: nodes[i]!.x, y1: nodes[i]!.y, x2: nodes[i + 1]!.x, y2: nodes[i + 1]!.y, lead, trail }, createContext(headKind, base))
    if (line)
      drawScene(ctx, line)
  }
  const focus = focusHead ? 0 : 1
  const drawNode = (i: number) => {
    const n = nodes[i]!
    const kind = kinds[i]!
    const hit = hits[i]!
    ctx.save()
    ctx.translate(n.x, n.y)
    if (t < hit) {
      // context nodes enter over their own windows; the focus fills the approach
      const win = i === focus ? 1.5 : 1.2
      const p = clamp01((t - (hit - win)) / win)
      if (p > 0)
        drawScene(ctx, renderNote(kind, { phase: 'enter', p }, createContext(kind, { ...base, heading: headingTo(n, nodes[i + 1] ?? n) }), { judgement: false }))
    }
    else if (t - hit <= clearDur) {
      const since = t - hit
      const burst = opts.grade === 'miss' ? { phase: 'miss' as const, t: since } : { phase: 'clear' as const, grade: opts.grade, t: since }
      drawScene(ctx, renderNote(kind, burst, createContext(kind, base), { judgement: opts.judgement }))
    }
    ctx.restore()
  }
  // the head sprite slides along the chain after its hit (a missed head stops
  // it); Cytoid paints earlier chain notes above later ones, so it rides on top
  // of the node it is approaching — only its own trigger burst sits above it
  const follow = t >= hits[0]! && t < hits[2]! && opts.grade !== 'miss'
    ? (() => {
        const seg = t < hits[1]! ? 0 : 1
        const a = nodes[seg]!
        const b = nodes[seg + 1]!
        const alpha = (t - hits[seg]!) / (hits[seg + 1]! - hits[seg]!)
        const followKind: NoteKind = click ? 'drag-head' : headKind
        const followCtx = click
          ? { ...createContext(followKind, { ...base, heading: headingTo(a, b) }), palette: opts.palette.family('click', opts.direction) }
          : createContext(followKind, { ...base, heading: headingTo(a, b) })
        return { x: a.x + (b.x - a.x) * alpha, y: a.y + (b.y - a.y) * alpha, kind: followKind, ctx: followCtx }
      })()
    : null
  drawNode(1)
  drawNode(2)
  if (follow) {
    ctx.save()
    ctx.translate(follow.x, follow.y)
    drawScene(ctx, renderNote(follow.kind, { phase: 'enter', p: 1 }, follow.ctx, { judgement: false }))
    ctx.restore()
  }
  drawNode(0)
  // the scanline sweeps straight through, judging each node as it passes
  const scanY = step * near * (t / 1.5 - 1)
  if (Math.abs(scanY) <= height / 2 + 3)
    drawScanline(ctx, width, scanY)
}
