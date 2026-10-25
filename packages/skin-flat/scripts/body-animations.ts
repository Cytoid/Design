/** Parametric Flat bodies; all visual motion is authored in the skin document. */
import type { AnimationDraft, Shape } from '@cytoid/design-tools/authoring'
import type { SkinInput, SkinTrack, SkinValue as Value } from '@cytoid/notes'

const input = (input: SkinInput): Value => ({ input })
const track = (track: string): Value => ({ track })
const mul = (...multiply: Value[]): Value => ({ multiply })
const add = (...add: Value[]): Value => ({ add })
const sub = (a: Value, b: Value): Value => add(a, mul(b, -1))
const lerp = (from: Value, to: Value, progress: Value): Value => ({ lerp: { from, to, progress } })
const positive = (name: string) => ({ track: name, from: 0 })
const identity = (driver: Value): SkinTrack => ({ ease: { type: 'linear' }, driver })

function revealTracks(): Record<string, SkinTrack> {
  return {
    reveal: { driver: input('appear'), keys: [{ at: 0.08, value: 0.8 }, { at: 0.35, value: 1, ease: { type: 'outCubic' } }] },
    alpha: { driver: input('appear'), keys: [{ at: 0.08, value: 0 }, { at: 0.22, value: 1 }] },
  }
}

export function holdBodyAnimation(): AnimationDraft {
  const width = input('bodyWidth')
  const half = mul(width, 0.5)
  const shown = mul(input('length'), track('reveal'))
  const done = mul(input('length'), input('progress'))
  const hair = input('hair')
  const dash = mul(input('dashPeriod'), 0.5)
  const rail = (x: Value): Shape => ({ type: 'line', x1: x, y1: 0, x2: x, y2: shown, stroke: 'theme:400', strokeWidth: mul(hair, 1.6), cap: 'butt', opacity: 0.9 })
  return {
    tracks: { ...revealTracks(), unfilled: identity(sub(shown, done)), done: identity(done) },
    properties: { opacity: track('alpha') },
    layers: [
      {
        type: 'group',
        clip: { type: 'rect', x: mul(half, -1), y: 0, w: width, h: shown },
        children: [
          { type: 'rect', x: mul(half, -1), y: 0, w: width, h: shown, fill: 'theme:800', opacity: 0.92 },
          { type: 'line', x1: 0, y1: shown, x2: 0, y2: done, stroke: 'theme:400', strokeWidth: mul(hair, 2.4), dash: [dash, dash], dashOffset: mul(input('elapsed'), width, 4), opacity: 0.75, when: positive('unfilled') },
          { type: 'rect', x: mul(half, -1), y: 0, w: width, h: done, fill: 'theme:400', when: positive('done') },
          { type: 'line', x1: 0, y1: 0, x2: 0, y2: done, stroke: 'ring:50', strokeWidth: mul(hair, 2), cap: 'butt', when: positive('done') },
        ],
      },
      rail(mul(half, -1)),
      rail(half),
    ],
  }
}

export function longHoldBodyAnimation(): AnimationDraft {
  const top = mul(input('top'), track('reveal'))
  const bottom = mul(input('bottom'), track('reveal'))
  const p = input('progress')
  const width = mul(input('bodyWidth'), sub(1, mul(0.85, track('shrink'))))
  const hair = input('hair')
  const dash = mul(input('dashPeriod'), 0.5)
  const flow = mul(input('elapsed'), input('bodyWidth'), 4)
  const seal = sub(1, track('shrink'))
  const rail = (x: Value): Shape => ({ type: 'line', x1: x, y1: mul(top, -1), x2: x, y2: bottom, stroke: 'theme:400', strokeWidth: mul(hair, 1.6), opacity: 0.9 })
  const conveyor = (from: Value, to: Value, phase: Value, completed: boolean, when: string): Shape => ({
    type: 'line',
    x1: 0,
    y1: from,
    x2: 0,
    y2: to,
    stroke: completed ? 'theme:800' : 'theme:400',
    strokeWidth: mul(hair, 2.4),
    dash: [dash, dash],
    dashOffset: sub(phase, flow),
    opacity: mul(completed ? 0.55 : 0.75, seal),
    when: positive(when),
  })
  const fillWidth = mul(width, lerp(0.6, 1, { clamp: { value: mul(p, 4) } }))
  return {
    tracks: {
      ...revealTracks(),
      shrink: { ease: { type: 'inSine' }, driver: input('collapse') },
      top: identity(top),
      bottom: identity(bottom),
      progress: identity(p),
    },
    properties: { opacity: track('alpha') },
    layers: [
      { type: 'rect', x: mul(width, -0.5), y: mul(top, -1), w: width, h: add(top, bottom), fill: 'theme:800', opacity: 0.55 },
      rail(mul(width, -0.5)),
      rail(mul(width, 0.5)),
      conveyor(mul(top, -1), mul(top, p, -1), 0, false, 'top'),
      conveyor(bottom, mul(bottom, p), dash, false, 'bottom'),
      {
        type: 'group',
        when: positive('progress'),
        children: [
          { type: 'rect', x: mul(fillWidth, -0.5), y: mul(top, p, -1), w: fillWidth, h: mul(add(top, bottom), p), fill: 'theme:400' },
          conveyor(mul(top, p, -1), 0, 0, true, 'top'),
          conveyor(mul(bottom, p), 0, dash, true, 'bottom'),
        ],
      },
    ],
  }
}
