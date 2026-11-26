/** Flat feedback is expanded to ordinary skin primitives during authoring. */
import type { AnimationDraft, Shape, SkinBuilder } from '@cytoid/design-tools/authoring'
import type { SkinColorBinding as Color, Grade, Timing, SkinTrack as Track, SkinValue as Value } from '@cytoid/notes'
import { GRADES, NOTE_KINDS, TIMED_GRADES, TIMING_TEXT, TIMINGS } from '@cytoid/notes'
import { GLYPHS } from '../src/glyphs'
import { tokens } from '../src/tokens'

const unit: Value = { input: 'unit' }
/**
 * Drop capsules are thin horizontal bars (~±0.10 unit with the keyline) that
 * sit exactly where the judgement text centre lands; the drop-click core is
 * white, so the mid-grey text has almost no contrast there. Drops also skip
 * the underline — the capsule itself is the horizontal rule — so the whole
 * label can lift clear of both the capsule and the expanding clear rings
 * (the second ring's band peaks ≈ 0.21 unit above the centre). Negative: y
 * grows down.
 */
export const DROP_LIFT = -0.27
/** extra distance drops sink the combined stacked label so its glyphs clear the second clear ring's bottom band (peaks ≈ 0.205 unit below the centre) */
export const DROP_STACK_SINK = 0.13
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

function judgement(grade: Grade, lift?: Value, withLine = true): AnimationDraft {
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
  const rise = mul(miss ? 1 : -1, H, 0.12, T('rise'))
  return {
    tracks,
    properties: { opacity: lerp(1, 0, T('fade')), transform: { y: lift ? add(rise, lift) : rise } },
    layers: [body, ...(miss || !withLine ? [] : [line])],
  }
}

function timing(timing: Timing, stacked: boolean, lift?: Value): AnimationDraft {
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
  const rise = mul(unit, -0.09 * 0.12, T('rise'))
  return {
    tracks,
    properties: {
      opacity: mul(T('enter'), lerp(1, 0, T('fade'))),
      transform: { x: mul(fast ? -1 : 1, H, 0.5, add(T('slide'), -1)), y: lift ? add(rise, lift) : rise },
    },
    layers: [
      { type: 'poly', points: [{ x: mul(cx - tip, H), y: mul(H, -0.4) }, { x: mul(cx + tip, H), y: 0 }, { x: mul(cx - tip, H), y: mul(H, 0.4) }], stroke: color, strokeWidth: mul(H, 0.22), join: 'miter', cap: 'square' },
      { type: 'group', transform: { x: mul(tx, H) }, children: [body] },
    ],
  }
}

export function bindFeedback(builder: SkinBuilder): void {
  /** stacked label centre below the judgement text centre (unit fractions) */
  const STACK_GAP = 0.09 * 1.18 + 0.06 / 2
  /** extra distance drops sink the stacked label so its glyphs clear the capsule's bottom stroke band (≈ ±0.114 unit) */
  const stackedBodies = Object.fromEntries(TIMINGS.map(value => [value, builder.animation(`timing-stacked-body-${value}`, timing(value, true))]))
  const stackedAt = (id: string, value: Timing, extra: number) =>
    builder.animation(id, { layers: [{ source: { animation: stackedBodies[value]! }, properties: { transform: { y: mul(unit, STACK_GAP + extra) } } }] })
  const stacked = Object.fromEntries(TIMINGS.map(value => [value, stackedAt(`timing-stacked-${value}`, value, 0)]))
  const stackedSunken = Object.fromEntries(TIMINGS.map(value => [value, stackedAt(`timing-stacked-drop-${value}`, value, DROP_STACK_SINK)]))
  // Every kind owns its feedback slots; the drafts are identical, so the
  // builder dedupes them to one animation and the slots share the reference.
  for (const kind of NOTE_KINDS) {
    // Drops lift both their judgement text and the standalone FAST / SLOW
    // label clear of the capsule and the clear rings; the capsule replaces
    // the judgement underline. In combined, the stacked label sinks below
    // the capsule's bottom band instead.
    const isDrop = kind.startsWith('drop-')
    const lift = isDrop ? mul(unit, DROP_LIFT) : undefined
    const judgements = Object.fromEntries(GRADES.map(grade => [grade, builder.bind(`${kind}:feedback:judgement:${grade}`, judgement(grade, lift, !isDrop))]))
    for (const grade of TIMED_GRADES) {
      for (const value of TIMINGS) {
        builder.bind(`${kind}:feedback:timing:${grade}:${value}`, timing(value, false, lift))
        builder.bind(`${kind}:feedback:combined:${grade}:${value}`, { layers: [{ source: { animation: judgements[grade]! } }, { source: { animation: (isDrop ? stackedSunken : stacked)[value]! } }] })
      }
    }
  }
}
