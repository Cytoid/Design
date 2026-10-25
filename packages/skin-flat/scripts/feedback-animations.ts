/** Flat feedback is expanded to ordinary skin primitives during authoring. */
import type { AnimationDraft, Shape, SkinBuilder } from '@cytoid/design-tools/authoring'
import type { SkinColorBinding as Color, Grade, Timing, SkinTrack as Track, SkinValue as Value } from '@cytoid/notes'
import { GRADES, TIMED_GRADES, TIMING_TEXT, TIMINGS } from '@cytoid/notes'
import { GLYPHS } from '../src/glyphs'
import { tokens } from '../src/tokens'

const unit: Value = { input: 'unit' }
const T = (track: string): Value => ({ track })
const mul = (...multiply: Value[]): Value => ({ multiply })
const add = (...add: Value[]): Value => ({ add })
const lerp = (from: Value, to: Value, progress: Value): Value => ({ lerp: { from, to, progress } })
const clamp = (value: Value): Value => ({ clamp: { value } })
function curve(from: number, to: number, ease?: 'outCubic' | 'outBack', amount = 2): Track {
  return { keys: [{ at: from, value: 0 }, { at: to, value: 1, ...(ease ? { ease: ease === 'outBack' ? { type: ease, amount } : { type: ease } } : {}) }] }
}
function textShape(text: string, H: Value, gap: Value, stroke: Value, color: Color, tracks: Record<string, Track>, from: number, stagger: number, to: number, amount: number): Shape {
  const glyphs = [...text].map(ch => GLYPHS[ch]!)
  const total = glyphs.reduce((sum, glyph) => sum + glyph.w, 0)
  let prefix = 0
  const children = glyphs.map((glyph, i): Shape => {
    const name = `letter${i}`
    tracks[name] = curve(from + i * stagger, to + i * stagger, 'outBack', amount)
    const k = T(name)
    const x = add(mul(prefix + glyph.w / 2 - total / 2, H), mul(i - (glyphs.length - 1) / 2, gap))
    prefix += glyph.w
    return {
      type: 'group',
      when: { track: name, from: 0 },
      opacity: clamp(mul(k, 1.5)),
      transform: { x, scale: lerp(0.4, 1, k) },
      children: glyph.strokes.map((points, j) => ({
        type: 'poly',
        points: points.map(([px, py]) => ({ x: mul(px - glyph.w / 2, H), y: mul(py - 0.5, H) })),
        ...(glyph.closed?.[j] ? { closed: true } : {}),
        stroke: color,
        strokeWidth: stroke,
        join: 'miter',
        cap: 'square',
      })),
    }
  })
  return { type: 'group', children }
}

function judgement(grade: Grade): AnimationDraft {
  const text = grade.toUpperCase()
  const H = mul(unit, 0.09)
  const miss = grade === 'miss'
  const tracks: Record<string, Track> = { gap: curve(0, 0.4, 'outCubic'), line: curve(0.05, 0.4, 'outCubic'), rise: { ease: { type: 'outCubic' } }, fade: curve(0.55, 0.85) }
  let color: Color = 'theme:400'
  if (miss) {
    tracks.ink = { keys: [{ at: 0, value: 'theme:400' }, { at: 1, value: '#FFFFFF' }], driver: 0.35 }
    color = { track: 'ink' }
  }
  const gap = lerp(H, mul(H, 0.75), T('gap'))
  const body = textShape(text, H, gap, mul(H, 0.18), color, tracks, 0.02, 0.035, 0.2, 2)
  const finalWidth = mul(H, [...text].reduce((sum, ch) => sum + GLYPHS[ch]!.w, 0) + 0.75 * (text.length - 1))
  const line: Shape = { type: 'rect', x: mul(add(mul(finalWidth, -0.5), mul(H, -0.3)), T('line')), y: mul(H, 0.8), w: mul(add(finalWidth, mul(H, 0.6)), T('line')), h: mul(H, 0.08), fill: color, opacity: 0.7, when: { track: 'line', from: 0 } }
  return {
    tracks,
    properties: { opacity: lerp(1, 0, T('fade')), transform: { y: mul(miss ? 1 : -1, H, 0.12, T('rise')) } },
    layers: [body, ...(miss ? [] : [line])],
  }
}

function timing(timing: Timing, stacked: boolean): AnimationDraft {
  const text = TIMING_TEXT[timing]
  const H = mul(unit, 0.10 * (stacked ? 0.6 : 1))
  const color = tokens.grade[timing === 'fast' ? 'bad' : 'good'] as `#${string}`
  const textWidth = [...text].reduce((sum, ch) => sum + GLYPHS[ch]!.w, 0) + 0.32 * (text.length - 1)
  const total = textWidth + 0.72 + 0.34
  const fast = timing === 'fast'
  const cx = fast ? -total / 2 + 0.34 / 2 : total / 2 - 0.34 / 2
  const tx = fast ? total / 2 - textWidth / 2 : -total / 2 + textWidth / 2
  const tip = (fast ? -1 : 1) * 0.34 / 2
  const tracks: Record<string, Track> = { slide: curve(0.06, 0.4, 'outCubic'), rise: { ease: { type: 'outCubic' } }, enter: curve(0.06, 0.2), fade: curve(0.55, 0.85) }
  const body = textShape(text, H, mul(H, 0.32), mul(H, 0.22), color, tracks, 0.06, 0.03, 0.24, 1.6)
  return {
    tracks,
    properties: {
      opacity: mul(T('enter'), lerp(1, 0, T('fade'))),
      transform: { x: mul(fast ? -1 : 1, H, 0.5, add(T('slide'), -1)), y: mul(unit, -0.09 * 0.12, T('rise')) },
    },
    layers: [
      { type: 'poly', points: [{ x: mul(cx - tip, H), y: mul(H, -0.4) }, { x: mul(cx + tip, H), y: 0 }, { x: mul(cx - tip, H), y: mul(H, 0.4) }], stroke: color, strokeWidth: mul(H, 0.22), join: 'miter', cap: 'square' },
      { type: 'group', transform: { x: mul(tx, H) }, children: [body] },
    ],
  }
}

export function bindFeedback(builder: SkinBuilder): void {
  const judgements = Object.fromEntries(GRADES.map(grade => [grade, builder.bind(`feedback:judgement:${grade}`, judgement(grade))]))
  const stacked = Object.fromEntries(TIMINGS.map((value) => {
    const body = builder.animation(`timing-stacked-body-${value}`, timing(value, true))
    return [value, builder.animation(`timing-stacked-${value}`, { layers: [{ source: { animation: body }, properties: { transform: { y: mul(unit, 0.09 * 1.18 + 0.06 / 2) } } }] })]
  }))
  for (const grade of TIMED_GRADES) {
    for (const value of TIMINGS) {
      builder.bind(`feedback:timing:${grade}:${value}`, timing(value, false))
      builder.bind(`feedback:combined:${grade}:${value}`, { layers: [{ source: { animation: judgements[grade]! } }, { source: { animation: stacked[value]! } }] })
    }
  }
}
