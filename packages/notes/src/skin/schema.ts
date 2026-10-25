import type { ClearGrade, ClipMode } from '../notes/types'
import type { Grade, NoteKind } from '../tokens'
/**
 * Skin format v1 — the data-driven note design schema.
 *
 * A skin is a plain JSON document: per note kind, per clip slot, an ordered
 * list of slices (the scene-graph primitives, every animatable field a
 * value expression) plus named animation tracks. The interpreter evaluates
 * tracks against the clip's driver and emits the same `SceneNode` trees the
 * imperative designs built — this module is the contract both the TS
 * reference interpreter and the future C# interpreter implement.
 *
 * Value grammar (closed, recursive — mirrors the imperative arithmetic):
 *   number | { track } | { anchor } | { lerp:[a,b,t] } | { add:[…] }
 *   | { mul:[…] } | { clamp:v, min?, max? }
 * Colors address the two palette ramps ({ shade: 50–950 }, { ring: 0–1 }),
 * raw hex, or the player's grade colours ({ game: 'perfect' }).
 *
 * Timing endpoints (keyframe `at`, window `from`/`until`, gates) are numbers
 * on the clip's normalized clock, or `{ anchor }` references for the few
 * endpoints that depend on the real approach window (the hold brackets land
 * a fixed number of *seconds* before the hit, whatever the scroll speed).
 */
import { z } from 'zod'
import { GRADES, NOTE_KINDS } from '../tokens'

/** A point in time on the clip's clock: a constant, or a context anchor. */
export type TimeRef = number | { anchor: string }

/**
 * Easing: a named function (`"outQuad"`), parameterized (`"outBack(2)"`,
 * `"outPow(1.5)"`), composed (`"outQuart(outCubic)"`), or a CSS cubic-bezier
 * `[x1, y1, x2, y2]`. Named functions are exactly `core/ease.ts`, ported 1:1.
 */
export type EaseSpec = string | [number, number, number, number]

/** Keyframes on the track's local clock; value holds before the first / after the last key. */
export interface KeysTrack {
  keys: { at: TimeRef, value: number, ease?: EaseSpec }[]
  /** phase shift and repeat rate applied to the clip clock: local = mod1(φ·rate + offset) */
  offset?: TimeRef
  rate?: number
}

/** A raw easing of the whole clip clock — `ease(u)` exactly, extrapolating past the edges (e.g. `1 − outQuint(u)` at u < 0). */
export interface EaseTrack {
  ease: EaseSpec
}

/** `sin(π·x)` bumps over each window, max-combined (the pre-hit blink). */
export interface BumpTrack {
  curve: 'bump'
  windows: [TimeRef, TimeRef][]
  low?: number
  high?: number
}

/** Viscous exponential decay `lerp(low, high, damped(u, damping))` — the hold bracket spin. */
export interface DampedTrack {
  curve: 'damped'
  from: TimeRef
  to: TimeRef
  turns: number
  damping: number
  low?: number
  high?: number
}

export type Track = KeysTrack | EaseTrack | BumpTrack | DampedTrack

/** Recursive numeric expression over anchors and named tracks. */
export type NumExpr = number
  | { track: string }
  | { anchor: string }
  | { lerp: [NumExpr, NumExpr, NumExpr] }
  | { add: NumExpr[] }
  | { mul: NumExpr[] }
  | { clamp: NumExpr, min?: number, max?: number }

/** Color: raw hex, an animated address on a palette ramp, or a player grade colour. */
export type ColorExpr = string | { shade: NumExpr } | { ring: NumExpr } | { game: Grade }

/**
 * Presence window, evaluated per frame — replicates the imperative `cond ? node : null`
 * guards exactly (a gated-out slice is absent from the tree, not transparent).
 * Default target is the clip's normalized clock; `track` targets a named track's
 * value (for value thresholds like the assembly's closed-at-0.999 branch).
 * Endpoints are strict unless flagged inclusive.
 */
export interface Gate {
  track?: string
  /** compare the track's local clock phase (mod1(φ·rate + offset)) instead of its value */
  phase?: boolean
  from?: TimeRef
  until?: TimeRef
  fromInclusive?: boolean
  untilInclusive?: boolean
}

export interface EdgeSpec {
  color: string
  placement?: 'inside' | 'outside'
  bands: { fraction: number, opacity: number }[]
}

export interface TransformExpr {
  x?: NumExpr
  y?: NumExpr
  rotate?: NumExpr
  scale?: NumExpr
  scaleX?: NumExpr
  scaleY?: NumExpr
}

interface StrokeFields {
  stroke?: ColorExpr
  strokeWidth?: NumExpr
  cap?: 'butt' | 'round' | 'square'
  join?: 'miter' | 'round' | 'bevel'
}

interface FillFields {
  fill?: ColorExpr
}

interface BaseFields {
  opacity?: NumExpr
  blend?: 'normal' | 'add'
  gate?: Gate
}

export interface CircleSlice extends BaseFields, StrokeFields, FillFields {
  type: 'circle'
  cx?: NumExpr
  cy?: NumExpr
  r: NumExpr
}

export interface ArcSlice extends BaseFields, StrokeFields {
  type: 'arc'
  cx?: NumExpr
  cy?: NumExpr
  r: NumExpr
  start: NumExpr
  end: NumExpr
}

export interface RectSlice extends BaseFields, StrokeFields, FillFields {
  type: 'rect'
  x: NumExpr
  y: NumExpr
  w: NumExpr
  h: NumExpr
  rx?: NumExpr
}

export interface PolySlice extends BaseFields, StrokeFields, FillFields {
  type: 'poly'
  points: [NumExpr, NumExpr][]
  closed?: boolean
}

export interface LineSlice extends BaseFields, StrokeFields {
  type: 'line'
  x1: NumExpr
  y1: NumExpr
  x2: NumExpr
  y2: NumExpr
}

/**
 * The assembled-ring primitive (`parts.assemblingRing` / `dashedRing`):
 * `segments` arcs that grow from their own centres (`assemble` 0→1) into a
 * closed circle at ≥ 0.999, with the stepped dark `edge` riding the same
 * motion. Deterministic — the interpreter expands it, no RNG involved.
 */
export interface RingSlice extends BaseFields, StrokeFields {
  type: 'ring'
  r: NumExpr
  width: NumExpr
  segments: number
  /** assembly progress 0→1 (for dashes: the duty cycle) */
  assemble: NumExpr
  spin?: NumExpr
  edge?: EdgeSpec
}

export interface GroupSlice extends BaseFields {
  type: 'group'
  transform?: TransformExpr
  clip?: { type: 'circle', cx?: NumExpr, cy?: NumExpr, r: NumExpr }
  isolate?: boolean
  children: Slice[]
}

/**
 * Structural branch: emits `then` when the gate is open, `else` (default:
 * nothing) otherwise. For the imperative pattern of switching a slot's whole
 * shape at a threshold (the flick outline reads as one closed diamond from
 * assembly 0.999, four growing lines before) — `gate` alone can only drop a
 * slice, not swap it.
 */
export interface SwitchSlice {
  type: 'switch'
  gate: Gate
  then: Slice
  else?: Slice
}

export type Slice = CircleSlice | ArcSlice | RectSlice | PolySlice | LineSlice | RingSlice | GroupSlice | SwitchSlice

/** Fields of the clip's root group — the group the imperative draw function returned. */
export interface RootFields {
  opacity?: NumExpr
  transform?: TransformExpr
  isolate?: boolean
}

/**
 * One clip slot. `layers` is paint order inside the root group; `root` carries
 * the root group's own fields (the fade/transform the imperative draw wrapped
 * everything in). `rewind` composites the enter slot played backwards (the
 * exit: the enter animation at `speed` × its real approach speed) under the
 * `alpha` curve — two independent clocks, engine implemented. `{ frames }` is
 * the baked-frame placeholder: v1 skins must not use it (the kind falls back
 * to built-in).
 */
export interface SkinClip {
  mode: ClipMode
  duration: number
  note?: string
  root?: RootFields
  tracks?: Record<string, Track>
  layers: Slice[]
  rewind?: { source: 'enter', speed: number }
  alpha?: { type: 'exit', drop: number, fall: number, power: number }
  frames?: string
}

export interface SkinHoldSlots {
  press: SkinClip
  /** looping layer drawn under the head (e.g. ripples) */
  loopUnder?: SkinClip
  /** looping layer drawn over the head (e.g. socket ping) */
  loopOver?: SkinClip
  progress: SkinClip
}

export interface SkinNote {
  enter: SkinClip
  clear: Record<ClearGrade, SkinClip>
  miss?: SkinClip
  exit?: SkinClip
  hold?: SkinHoldSlots
}

/** Skin-level defaults. v1 renders from the consumer's palette; these document the author's intent. */
export interface SkinMeta {
  palette?: {
    chroma?: number
    hue?: Record<string, { up: number, down: number }>
    ring?: string
    grade?: Record<Grade, string>
  }
  grades?: Record<Grade, string>
}

export interface Skin {
  schemaVersion: 1
  id: string
  name: string
  meta?: SkinMeta
  notes: Record<NoteKind, SkinNote>
}

/* ------------------------------------------------------------------ */
/* zod schemas — the runtime validation of the above                    */
/* ------------------------------------------------------------------ */

const timeRef: z.ZodType<TimeRef> = z.union([z.number(), z.object({ anchor: z.string() })])
const ease: z.ZodType<EaseSpec> = z.union([z.string(), z.tuple([z.number(), z.number(), z.number(), z.number()])])
const numExpr: z.ZodType<NumExpr> = z.lazy(() => z.union([
  z.number(),
  z.object({ track: z.string() }),
  z.object({ anchor: z.string() }),
  z.object({ lerp: z.tuple([numExpr, numExpr, numExpr]) }),
  z.object({ add: z.array(numExpr).min(1) }),
  z.object({ mul: z.array(numExpr).min(1) }),
  z.object({ clamp: numExpr, min: z.number().optional(), max: z.number().optional() }),
])) as z.ZodType<NumExpr>

const keysTrack: z.ZodType<KeysTrack> = z.object({
  keys: z.array(z.object({ at: timeRef, value: z.number(), ease: ease.optional() })).min(1),
  offset: timeRef.optional(),
  rate: z.number().optional(),
})
const easeTrack: z.ZodType<EaseTrack> = z.object({ ease })
const bumpTrack: z.ZodType<BumpTrack> = z.object({
  curve: z.literal('bump'),
  windows: z.array(z.tuple([timeRef, timeRef])).min(1),
  low: z.number().optional(),
  high: z.number().optional(),
})
const dampedTrack: z.ZodType<DampedTrack> = z.object({
  curve: z.literal('damped'),
  from: timeRef,
  to: timeRef,
  turns: z.number(),
  damping: z.number(),
  low: z.number().optional(),
  high: z.number().optional(),
})
const track: z.ZodType<Track> = z.union([keysTrack, easeTrack, bumpTrack, dampedTrack])

const colorExpr: z.ZodType<ColorExpr> = z.lazy(() => z.union([
  z.string(),
  z.object({ shade: numExpr }),
  z.object({ ring: numExpr }),
  z.object({ game: z.enum(GRADES) }),
])) as z.ZodType<ColorExpr>

const gate: z.ZodType<Gate> = z.object({
  track: z.string().optional(),
  phase: z.boolean().optional(),
  from: timeRef.optional(),
  until: timeRef.optional(),
  fromInclusive: z.boolean().optional(),
  untilInclusive: z.boolean().optional(),
})

const stroke = {
  stroke: colorExpr.optional(),
  strokeWidth: numExpr.optional(),
  cap: z.enum(['butt', 'round', 'square']).optional(),
  join: z.enum(['miter', 'round', 'bevel']).optional(),
}
const base = {
  opacity: numExpr.optional(),
  blend: z.enum(['normal', 'add']).optional(),
  gate: z.lazy(() => gate).optional(),
}
const fill = { fill: colorExpr.optional() }

const transform: z.ZodType<TransformExpr> = z.lazy(() => z.object({
  x: numExpr.optional(),
  y: numExpr.optional(),
  rotate: numExpr.optional(),
  scale: numExpr.optional(),
  scaleX: numExpr.optional(),
  scaleY: numExpr.optional(),
})) as z.ZodType<TransformExpr>

const edgeSpec: z.ZodType<EdgeSpec> = z.object({
  color: z.string(),
  placement: z.enum(['inside', 'outside']).optional(),
  bands: z.array(z.object({ fraction: z.number(), opacity: z.number() })),
})

const slice: z.ZodType<Slice> = z.lazy(() => z.union([
  z.object({ type: z.literal('circle'), cx: numExpr.optional(), cy: numExpr.optional(), r: numExpr, ...stroke, ...fill, ...base }),
  z.object({ type: z.literal('arc'), cx: numExpr.optional(), cy: numExpr.optional(), r: numExpr, start: numExpr, end: numExpr, ...stroke, ...base }),
  z.object({ type: z.literal('rect'), x: numExpr, y: numExpr, w: numExpr, h: numExpr, rx: numExpr.optional(), ...stroke, ...fill, ...base }),
  z.object({ type: z.literal('poly'), points: z.array(z.tuple([numExpr, numExpr])), closed: z.boolean().optional(), ...stroke, ...fill, ...base }),
  z.object({ type: z.literal('line'), x1: numExpr, y1: numExpr, x2: numExpr, y2: numExpr, ...stroke, ...base }),
  z.object({ type: z.literal('ring'), r: numExpr, width: numExpr, segments: z.number().int().positive(), assemble: numExpr, spin: numExpr.optional(), edge: edgeSpec.optional(), ...stroke, ...base }),
  z.object({
    type: z.literal('group'),
    transform: transform.optional(),
    clip: z.object({ type: z.literal('circle'), cx: numExpr.optional(), cy: numExpr.optional(), r: numExpr }).optional(),
    isolate: z.boolean().optional(),
    children: z.array(slice),
    ...base,
  }),
  z.object({ type: z.literal('switch'), gate, then: slice, else: slice.optional() }),
])) as z.ZodType<Slice>

const rootFields: z.ZodType<RootFields> = z.lazy(() => z.object({
  opacity: numExpr.optional(),
  transform: transform.optional(),
  isolate: z.boolean().optional(),
})) as z.ZodType<RootFields>

const skinClip: z.ZodType<SkinClip> = z.object({
  mode: z.enum(['normalized', 'once', 'loop', 'progress', 'static']),
  duration: z.number().positive(),
  note: z.string().optional(),
  root: rootFields.optional(),
  tracks: z.record(z.string(), track).optional(),
  layers: z.array(slice),
  rewind: z.object({ source: z.literal('enter'), speed: z.number() }).optional(),
  alpha: z.object({ type: z.literal('exit'), drop: z.number(), fall: z.number(), power: z.number() }).optional(),
  frames: z.string().optional(),
})

const skinNote: z.ZodType<SkinNote> = z.object({
  enter: skinClip,
  clear: z.object({
    perfect: skinClip,
    great: skinClip,
    good: skinClip,
    bad: skinClip,
  }),
  miss: skinClip.optional(),
  exit: skinClip.optional(),
  hold: z.object({ press: skinClip, loopUnder: skinClip.optional(), loopOver: skinClip.optional(), progress: skinClip }).optional(),
})

export const skinSchema: z.ZodType<Skin> = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  meta: z.object({
    palette: z.object({
      chroma: z.number().optional(),
      hue: z.record(z.string(), z.object({ up: z.number(), down: z.number() })).optional(),
      ring: z.string().optional(),
      grade: z.record(z.enum(GRADES), z.string()).optional(),
    }).optional(),
    grades: z.record(z.enum(GRADES), z.string()).optional(),
  }).optional(),
  notes: z.record(z.enum(NOTE_KINDS), skinNote),
}) as z.ZodType<Skin>

/** Parse and validate a skin document. Throws with a readable message on invalid input. */
export function parseSkin(json: unknown): Skin {
  const result = skinSchema.safeParse(json)
  if (!result.success) {
    const issue = result.error.issues[0]
    throw new Error(`invalid skin: ${issue ? `${issue.path.join('.')} — ${issue.message}` : result.error.message}`)
  }
  return result.data
}
