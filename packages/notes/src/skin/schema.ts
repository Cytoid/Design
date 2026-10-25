/** Skin: static frames, reusable normalized animations, engine slot bindings. */
import type { z } from 'zod'
import { z as schema } from 'zod'
import { GRADES } from '../tokens'

const finite = schema.number().finite()
const name = schema.string().min(1).max(128).refine(value => !Object.hasOwn(Object.prototype, value), 'reserved identifier')
const object = schema.strictObject

export const INPUTS = [
  'unit',
  'size',
  'heading',
  'R',
  'W',
  'inner',
  'ringC',
  'innerHalf',
  'hair',
  'ringW',
  'bracketR',
  'bracketW',
  'holdLanding',
  'glyphW',
  'coreR',
  'progressR',
  'progressW',
  'flickW',
  'rv',
  'flickInner',
  'coreMax',
  'frameOuter',
  'near',
  'nearFar',
  'approachNear',
  'arrowSize',
  'arrowTip',
  'arrowHalf',
  'exitRewindEnd',
] as const
export type Input = typeof INPUTS[number]
export type Time = number | { input: 'holdLanding' | 'exitRewindEnd' }
export type Value = number | { input: Input } | { track: string }
  | { lerp: { from: Value, to: Value, progress: Value } }
  | { add: Value[] } | { multiply: Value[] }
  | { clamp: { value: Value, min?: number, max?: number } }
export type Ease = { type: 'linear' | 'inQuad' | 'outQuad' | 'inSine' | 'outSine' | 'inOutSine' | 'inOutQuad' | 'inCubic' | 'outCubic' | 'inOutCubic' | 'outQuart' | 'outQuint' | 'inExpo' | 'outExpo' }
  | { type: 'outBack', amount: number }
  | { type: 'inPow' | 'outPow', power: number }
  | { type: 'bezier', x1: number, y1: number, x2: number, y2: number }
  | { type: 'compose', outer: Ease, inner: Ease }
  | { type: 'step' }
export type Color = string | { shade: Value } | { ring: Value } | { grade: typeof GRADES[number] } | { palette: 'ring' | 'fill' }
export interface Window { from: Time, to: Time }
export type Track = {
  keys: { at: Time, value: number, ease?: Ease, window?: Window }[]
  offset?: Time
  rate?: number
} | { ease: Ease }
| { curve: 'bump', windows: Window[], low?: number, high?: number }
| { curve: 'damped', from: Time, to: Time, damping: number, low?: number, high?: number }
| { curve: 'fade', drop: number, fall: number, power: number }
export interface Gate {
  track?: string
  phase?: boolean
  from?: Time
  until?: Time
  fromInclusive?: boolean
  untilInclusive?: boolean
}
export interface Transform {
  x?: Value
  y?: Value
  rotate?: Value
  scale?: Value
  scaleX?: Value
  scaleY?: Value
}
export interface Properties {
  opacity?: Value
  transform?: Transform
  cx?: Value
  cy?: Value
  r?: Value
  start?: Value
  end?: Value
  x?: Value
  y?: Value
  w?: Value
  h?: Value
  rx?: Value
  x1?: Value
  y1?: Value
  x2?: Value
  y2?: Value
  width?: Value
  assemble?: Value
  spin?: Value
  strokeWidth?: Value
  fill?: Color
  stroke?: Color
  points?: { x: Value, y: Value }[]
  clip?: { type: 'circle', cx?: Value, cy?: Value, r: Value }
}

const time: z.ZodType<Time> = schema.union([finite, object({ input: schema.enum(['holdLanding', 'exitRewindEnd']) })])
const value: z.ZodType<Value> = schema.lazy(() => schema.union([
  finite,
  object({ input: schema.enum(INPUTS) }),
  object({ track: name }),
  object({ lerp: object({ from: value, to: value, progress: value }) }),
  object({ add: schema.array(value).min(1).max(64) }),
  object({ multiply: schema.array(value).min(1).max(64) }),
  object({ clamp: object({ value, min: finite.optional(), max: finite.optional() }) }),
]))
const ease: z.ZodType<Ease> = schema.lazy(() => schema.union([
  object({ type: schema.enum(['linear', 'inQuad', 'outQuad', 'inSine', 'outSine', 'inOutSine', 'inOutQuad', 'inCubic', 'outCubic', 'inOutCubic', 'outQuart', 'outQuint', 'inExpo', 'outExpo', 'step']) }),
  object({ type: schema.literal('outBack'), amount: finite }),
  object({ type: schema.enum(['inPow', 'outPow']), power: finite.positive() }),
  object({ type: schema.literal('bezier'), x1: finite.min(0).max(1), y1: finite, x2: finite.min(0).max(1), y2: finite }),
  object({ type: schema.literal('compose'), outer: ease, inner: ease }),
]))
const color: z.ZodType<Color> = schema.union([
  schema.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i),
  object({ shade: value }),
  object({ ring: value }),
  object({ grade: schema.enum(GRADES) }),
  object({ palette: schema.enum(['ring', 'fill']) }),
])
const window = object({ from: time, to: time })
const track: z.ZodType<Track> = schema.union([
  object({ keys: schema.array(object({ at: time, value: finite, ease: ease.optional(), window: window.optional() })).min(1).max(4096), offset: time.optional(), rate: finite.optional() }),
  object({ ease }),
  object({ curve: schema.literal('bump'), windows: schema.array(window).min(1).max(128), low: finite.optional(), high: finite.optional() }),
  object({ curve: schema.literal('damped'), from: time, to: time, damping: finite.positive(), low: finite.optional(), high: finite.optional() }),
  object({ curve: schema.literal('fade'), drop: finite.min(0).max(1), fall: finite.nonnegative(), power: finite.positive() }),
])
const gate: z.ZodType<Gate> = object({
  track: name.optional(),
  phase: schema.boolean().optional(),
  from: time.optional(),
  until: time.optional(),
  fromInclusive: schema.boolean().optional(),
  untilInclusive: schema.boolean().optional(),
})
const transform: z.ZodType<Transform> = object({
  x: value.optional(),
  y: value.optional(),
  rotate: value.optional(),
  scale: value.optional(),
  scaleX: value.optional(),
  scaleY: value.optional(),
})
const properties: z.ZodType<Properties> = object({
  opacity: value.optional(),
  transform: transform.optional(),
  ...Object.fromEntries(['cx', 'cy', 'r', 'start', 'end', 'x', 'y', 'w', 'h', 'rx', 'x1', 'y1', 'x2', 'y2', 'width', 'assemble', 'spin', 'strokeWidth'].map(k => [k, value.optional()])),
  fill: color.optional(),
  stroke: color.optional(),
  points: schema.array(object({ x: value, y: value })).max(4096).optional(),
  clip: object({ type: schema.literal('circle'), cx: value.optional(), cy: value.optional(), r: value }).optional(),
})

const paint = { opacity: finite.optional(), blend: schema.enum(['normal', 'add']).optional() }
const stroke = { stroke: color.optional(), strokeWidth: finite.nonnegative().optional(), cap: schema.enum(['butt', 'round', 'square']).optional(), join: schema.enum(['miter', 'round', 'bevel']).optional() }
const fill = { fill: color.optional() }
const edge = object({
  color: schema.string().regex(/^#[\da-f]{6}$/i),
  placement: schema.enum(['inside', 'outside']).optional(),
  bands: schema.array(object({ fraction: finite.nonnegative(), opacity: finite.min(0).max(1) })).max(128),
})
// The numeric-only schema deliberately rejects time/track expressions inside frames.
const staticColor = schema.union([
  schema.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i),
  object({ shade: finite }),
  object({ ring: finite }),
  object({ grade: schema.enum(GRADES) }),
  object({ palette: schema.enum(['ring', 'fill']) }),
])
const staticStroke = { ...stroke, stroke: staticColor.optional() }
const staticFill = { ...fill, fill: staticColor.optional() }
const staticTransform = object(Object.fromEntries(['x', 'y', 'rotate', 'scale', 'scaleX', 'scaleY'].map(k => [k, finite.optional()])))
const clip = object({ type: schema.literal('circle'), r: finite, cx: finite.optional(), cy: finite.optional() })
const leafFrame = schema.discriminatedUnion('type', [
  object({ type: schema.literal('circle'), r: finite, cx: finite.optional(), cy: finite.optional(), ...staticStroke, ...staticFill, ...paint }),
  object({ type: schema.literal('arc'), r: finite, start: finite, end: finite, cx: finite.optional(), cy: finite.optional(), ...staticStroke, ...paint }),
  object({ type: schema.literal('rect'), x: finite, y: finite, w: finite, h: finite, rx: finite.optional(), ...staticStroke, ...staticFill, ...paint }),
  object({ type: schema.literal('line'), x1: finite, y1: finite, x2: finite, y2: finite, ...staticStroke, ...paint }),
  object({ type: schema.literal('poly'), points: schema.array(object({ x: finite, y: finite })).max(4096), closed: schema.boolean().optional(), ...staticStroke, ...staticFill, ...paint }),
  object({ type: schema.literal('ring'), r: finite, width: finite, segments: schema.number().int().min(1).max(256), assemble: finite, spin: finite.optional(), edge: edge.optional(), ...staticStroke, ...paint }),
])
export type Frame = z.infer<typeof leafFrame> | { type: 'group', opacity?: number, blend?: 'normal' | 'add', transform?: Record<string, number | undefined>, clip?: { type: 'circle', r: number, cx?: number, cy?: number }, isolate?: boolean, children?: Frame[] }
const frame: z.ZodType<Frame> = schema.lazy(() => schema.union([
  leafFrame,
  object({ type: schema.literal('group'), ...paint, transform: staticTransform.optional(), clip: clip.optional(), isolate: schema.boolean().optional(), children: schema.array(frame).max(4096).optional() }),
]))

export interface Layer {
  source: { frame: string } | { animation: string, sample?: { from?: Time, to?: Time } }
  at?: number
  until?: number
  properties?: Properties
  layers?: Layer[]
  when?: Gate
  otherwise?: Layer
}
export interface Animation {
  tracks?: Record<string, Track>
  properties?: Pick<Properties, 'opacity' | 'transform'>
  isolate?: boolean
  layers: Layer[]
}
export interface Slot { animation: string, note?: string }
export interface SkinMeta {
  palette?: {
    chroma?: number
    hue?: Record<string, { up: number, down: number }>
    ring?: string
    grade?: Record<typeof GRADES[number], string>
  }
  grades?: Record<typeof GRADES[number], string>
}
export interface Skin {
  schemaVersion: 2
  id: string
  name: string
  meta?: SkinMeta
  frames: Record<string, Frame>
  animations: Record<string, Animation>
  slots: Record<string, Slot>
}
const layer: z.ZodType<Layer> = schema.lazy(() => object({
  source: schema.union([
    object({ frame: name }),
    object({ animation: name, sample: object({ from: time.optional(), to: time.optional() }).optional() }),
  ]),
  at: finite.min(0).max(1).optional(),
  until: finite.min(0).max(1).optional(),
  properties: properties.optional(),
  layers: schema.array(layer).max(4096).optional(),
  when: gate.optional(),
  otherwise: layer.optional(),
}))
export const skinSchema: z.ZodType<Skin> = object({
  schemaVersion: schema.literal(2),
  id: name,
  name: schema.string().min(1).max(256),
  meta: object({
    palette: object({
      chroma: finite.optional(),
      hue: schema.record(name, object({ up: finite, down: finite })).optional(),
      ring: schema.string().optional(),
      grade: schema.record(schema.enum(GRADES), schema.string()).optional(),
    }).optional(),
    grades: schema.record(schema.enum(GRADES), schema.string()).optional(),
  }).optional(),
  frames: schema.record(name, frame),
  animations: schema.record(name, object({
    tracks: schema.record(name, track).optional(),
    properties: object({ opacity: value.optional(), transform: transform.optional() }).optional(),
    isolate: schema.boolean().optional(),
    layers: schema.array(layer).max(4096),
  })),
  slots: schema.record(name, object({ animation: name, note: schema.string().max(4096).optional() })),
})

/** Bound unknown JSON before recursive schema validation (including cyclic JS objects). */
export function parseSkin(json: unknown): Skin {
  let count = 0
  const seen = new Set<object>()
  const visit = (v: unknown, depth: number): void => {
    if (++count > 500_000 || depth > 64)
      throw new Error('invalid skin: document budget exceeded')
    if (v && typeof v === 'object') {
      if (seen.has(v))
        throw new Error('invalid skin: cyclic document')
      seen.add(v)
      for (const child of Object.values(v)) visit(child, depth + 1)
      seen.delete(v)
    }
  }
  visit(json, 0)
  const result = skinSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]!
    throw new Error(`invalid skin: ${issue.path.join('.')} — ${issue.message}`)
  }
  return result.data
}
