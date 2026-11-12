/**
 * Judgement text — PERFECT / GREAT / GOOD / BAD / MISS.
 *
 * Typeface: a custom monoline, chamfered (45°) geometric capital set drawn
 * with the same polyline primitives as the notes — no font files, identical
 * in Canvas, SVG/resvg bakes and a Unity port. The 14 judgement letters plus
 * digits and '%' (combo / score UI) are defined, plus L / W for the
 * FAST / SLOW timing label (`timing.ts`).
 *
 * Motion (u = t / duration, duration = the grade's clear duration):
 *  0.00–0.40  tracking closes in (1.0 H → 0.75 H letter gap)
 *  0.02–0.35  letters pop in one after another (scale 0.4 → 1, outBack)
 *  0.05–0.40  a thin underline grows from the centre (not for MISS)
 *  0.00–1.00  text rises 0.12 H (MISS sinks instead)
 *  0.55–0.85  fade out — a short hold after the enter settles, gone before
 *             the clear effect ends
 *
 * Animated feedback is authored in scripts/feedback-animations.ts and
 * compiled from the skin. These helpers expose Flat's static glyph layout.
 */
import type { DrawContext, Grade, SceneNode } from '@cytoid/notes'

import { group, lerp } from '@cytoid/notes'

import { GLYPHS } from './glyphs'
import { designs } from './render'

const GAP = 0.75

export const JUDGEMENT_TEXT: Record<Grade, string> = {
  perfect: 'PERFECT',
  great: 'GREAT',
  good: 'GOOD',
  bad: 'BAD',
  miss: 'MISS',
}

/** Cap height in px for a context (0.17 → 0.12 → 0.10 → 0.09 — smaller text glares less). */
export const judgementCapHeight = (ctx: DrawContext) => ctx.unit * 0.09

/** Width of a rendered string in px (same metrics as `drawText`). Unknown glyphs are skipped. */
export function measureText(text: string, H: number, gap?: number): number {
  const g = gap ?? H * GAP
  const glyphs = [...text].map(ch => GLYPHS[ch]!).filter(Boolean)
  return glyphs.reduce((a, gl) => a + gl.w * H, 0) + g * Math.max(0, glyphs.length - 1)
}

/** Where the text centre sits relative to the note centre: the centre of the effect. */
export function judgementOffset(_ctx: DrawContext): { x: number, y: number } {
  return { x: 0, y: 0 }
}

/** Static text layout (no animation): useful for previews and tests. */
export function drawText(text: string, H: number, color: string, opts: { gap?: number, stroke?: number, pop?: (i: number) => number } = {}): SceneNode {
  const gap = opts.gap ?? H * GAP
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

/** Compiled global judgement-only slots; no imperative animation fallback. */
export const judgementClips = designs.feedback.judgement
