/**
 * Judgement text — PERFECT / GREAT / GOOD / BAD / MISS.
 *
 * Typeface: a custom monoline, chamfered (45°) geometric capital set drawn
 * with the same polyline primitives as the notes — no font files, identical
 * in Canvas, SVG/resvg bakes and a Unity port. The 14 judgement letters plus
 * digits and '%' (combo / score UI) are defined.
 *
 * Motion (u = t / duration, duration = the grade's clear duration):
 *  0.00–0.40  tracking closes in (1.0 H → 0.32 H letter gap)
 *  0.02–0.35  letters pop in one after another (scale 0.4 → 1, outBack)
 *  0.05–0.40  a thin underline grows from the centre (not for MISS)
 *  0.00–1.00  text rises 0.12 H (MISS sinks instead)
 *  0.70–1.00  fade out
 *
 * The clip is drawn around the *text centre*. Place it above the note with
 * `judgementOffset(ctx)` (renderNote does this): the text sits in the centre
 * of the clear / miss effect.
 */
import type { SceneNode } from '../core/scene'
import type { Grade } from '../tokens'
import type { Clip, DrawContext } from './types'
import { mix } from '../core/color'
import { lerp, outBack, outCubic, seg } from '../core/ease'
import { group } from '../core/scene'
import { GRADES, tokens } from '../tokens'

type Stroke = [number, number][]
interface Glyph { w: number, strokes: Stroke[], closed?: boolean[] }

const W = 0.62
const K = 0.18 // chamfer
const M = 0.82

/** Glyphs in a 1-unit-high box, y down. */
const GLYPHS: Record<string, Glyph> = {
  'P': { w: W, strokes: [[[0, 1], [0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]]] },
  'E': { w: W, strokes: [[[W, 0], [0, 0], [0, 1], [W, 1]], [[0, 0.5], [W * 0.82, 0.5]]] },
  'R': { w: W, strokes: [[[0, 1], [0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]], [[W * 0.42, 0.5], [W, 1]]] },
  'F': { w: W, strokes: [[[W, 0], [0, 0], [0, 1]], [[0, 0.5], [W * 0.82, 0.5]]] },
  'C': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W, 1]]] },
  'T': { w: W, strokes: [[[0, 0], [W, 0]], [[W / 2, 0], [W / 2, 1]]] },
  'G': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W, 1], [W, 0.55], [W * 0.48, 0.55]]] },
  'A': { w: W, strokes: [[[0, 1], [0, K], [K, 0], [W - K, 0], [W, K], [W, 1]], [[0, 0.58], [W, 0.58]]] },
  'O': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]]], closed: [true] },
  'D': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [0, 1]]], closed: [true] },
  'B': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]], [[W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1], [0, 0]]] },
  'M': { w: M, strokes: [[[0, 1], [0, 0], [M / 2, 0.55], [M, 0], [M, 1]]] },
  'I': { w: 0, strokes: [[[0, 0], [0, 1]]] },
  'S': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1]]] },
  'X': { w: W * 0.9, strokes: [[[0, 0], [W * 0.9, 1]], [[W * 0.9, 0], [0, 1]]] },
  // digits — same chamfered stroke language as the letters (combo / score UI)
  '0': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]]], closed: [true] },
  '1': { w: 0.34, strokes: [[[0, 0.16], [0.17, 0], [0.17, 1]]] },
  '2': { w: W, strokes: [[[0, K], [K, 0], [W - K, 0], [W, K], [W, 0.42], [0.08, 1], [W, 1]]] },
  '3': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K]], [[0, 0.5], [W * 0.75, 0.5]]] },
  '4': { w: W, strokes: [[[W * 0.68, 0], [0, 0.62], [W, 0.62]], [[W * 0.68, 0], [W * 0.68, 1]]] },
  '5': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1]]] },
  '6': { w: W, strokes: [[[W, K], [W - K, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W - K, 1], [W, 1 - K], [W, 0.5 + K], [W - K, 0.5], [0.06, 0.5]]] },
  '7': { w: W, strokes: [[[0, 0], [W, 0], [W * 0.38, 1]]] },
  '8': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]], [[0, 0.5], [W, 0.5]]], closed: [true, false] },
  '9': { w: W, strokes: [[[0, 1 - K], [K, 1], [W - K, 1], [W, 1 - K], [W, K], [W - K, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - 0.06, 0.5]]] },
  '%': { w: 0.78, strokes: [[[0.72, 0], [0.06, 1]], [[0.02, 0.06], [0.3, 0.06], [0.3, 0.34], [0.02, 0.34]], [[0.48, 0.66], [0.76, 0.66], [0.76, 0.94], [0.48, 0.94]]], closed: [false, true, true] },
  '.': { w: 0.26, strokes: [[[0.05, 0.9], [0.21, 0.9], [0.21, 1], [0.05, 1]]], closed: [true] },
}

export const JUDGEMENT_TEXT: Record<Grade, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  bad: 'BAD',
  miss: 'MISS',
}

/** Cap height in px for a context (reduced from the original 0.17 — smaller text glares less). */
export const judgementCapHeight = (ctx: DrawContext) => ctx.unit * 0.12

/** Width of a rendered string in px (same metrics as `drawText`). Unknown glyphs are skipped. */
export function measureText(text: string, H: number, gap?: number): number {
  const g = gap ?? H * 0.32
  const glyphs = [...text].map(ch => GLYPHS[ch]!).filter(Boolean)
  return glyphs.reduce((a, gl) => a + gl.w * H, 0) + g * Math.max(0, glyphs.length - 1)
}

/** Where the text centre sits relative to the note centre: the centre of the effect. */
export function judgementOffset(_ctx: DrawContext): { x: number, y: number } {
  return { x: 0, y: 0 }
}

/** Static text layout (no animation): useful for previews and tests. */
export function drawText(text: string, H: number, color: string, opts: { gap?: number, stroke?: number, pop?: (i: number) => number } = {}): SceneNode {
  const gap = opts.gap ?? H * 0.32
  const sw = opts.stroke ?? H * 0.18
  const glyphs = [...text].map(ch => GLYPHS[ch]!).filter(Boolean)
  const total = glyphs.reduce((a, g) => a + g.w * H, 0) + gap * (glyphs.length - 1)
  let x = -total / 2
  const nodes: SceneNode[] = []
  glyphs.forEach((g, i) => {
    const k = opts.pop ? opts.pop(i) : 1
    const cx = x + (g.w * H) / 2
    if (k > 0) {
      nodes.push(group(
        g.strokes.map((s, j) => ({
          type: 'poly' as const,
          points: s.map(([px, py]) => [(px - g.w / 2) * H, (py - 0.5) * H] as [number, number]),
          closed: g.closed?.[j],
          stroke: color,
          strokeWidth: sw,
          join: 'miter' as const,
          cap: 'square' as const,
        })),
        { opacity: Math.min(1, k * 1.5), transform: { x: cx, scale: lerp(0.4, 1, k) } },
      ))
    }
    x += g.w * H + gap
  })
  return group(nodes)
}

function draw(grade: Grade) {
  return (t: number, ctx: DrawContext): SceneNode => {
    const u = t / tokens.time.clear[grade]
    const H = judgementCapHeight(ctx)
    // MISS grey is lifted so it stays readable over the dim ghost note
    const color = grade === 'miss' ? mix(ctx.grades.miss, '#FFFFFF', 0.35) : ctx.grades[grade]
    const miss = grade === 'miss'
    const text = JUDGEMENT_TEXT[grade]
    const gap = lerp(H, H * 0.32, outCubic(seg(u, 0, 0.4)))
    const pop = (i: number) => outBack(seg(u, 0.02 + i * 0.035, 0.2 + i * 0.035), 2)
    const body = drawText(text, H, color, { gap, pop })
    // underline: full final text width, grows from the centre
    const finalW = [...text].reduce((a, ch) => a + (GLYPHS[ch]?.w ?? 0) * H, 0) + H * 0.32 * (text.length - 1)
    const lk = outCubic(seg(u, 0.05, 0.4))
    const line: SceneNode | null = !miss && lk > 0
      ? { type: 'rect', x: (-finalW / 2 - H * 0.3) * lk, y: H * 0.8, w: (finalW + H * 0.6) * lk, h: H * 0.08, fill: color, opacity: 0.7 }
      : null
    const dy = (miss ? 1 : -1) * H * 0.12 * outCubic(u)
    return group([body, line].filter(Boolean) as SceneNode[], { opacity: 1 - seg(u, 0.7, 1), transform: { y: dy } })
  }
}

/** One clip per grade; shared by every note kind. Duration = that grade's clear duration. */
export const judgementClips: Record<Grade, Clip> = Object.fromEntries(GRADES.map(g => [g, {
  id: `judgement-${g}`,
  mode: 'once',
  duration: tokens.time.clear[g],
  draw: draw(g),
  note: `“${JUDGEMENT_TEXT[g]}” — chamfered monoline caps, letters pop in while the tracking closes; drawn around the text centre.`,
} satisfies Clip])) as Record<Grade, Clip>
