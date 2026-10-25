/** Native skin numeric, curve and primitive evaluation. */
import type { SceneNode, Transform } from '../core/scene'
import type { DrawContext } from '../notes/types'
import type { InputTable } from './inputs'
import type { Primitive } from './primitive'
import type { Color, Ease, Frame, Gate, Time, Track, Transform as TransformSpec, Value } from './schema'
import { bump, clamp, lerp, seg } from '../core/ease'
import * as curves from '../core/ease'
import { ringTone, tone } from '../palette'

/* ------------------------------------------------------------------ */
/* easing                                                              */

export type EaseFn = (t: number) => number

export function compileEase(ease: Ease): EaseFn {
  switch (ease.type) {
    case 'bezier': return curves.cubicBezier(ease.x1, ease.y1, ease.x2, ease.y2)
    case 'outBack': return t => 1 + (ease.amount + 1) * (t - 1) ** 3 + ease.amount * (t - 1) ** 2
    case 'inPow': return t => t ** ease.power
    case 'outPow': return t => 1 - (1 - t) ** ease.power
    case 'compose': {
      const outer = compileEase(ease.outer)
      const inner = compileEase(ease.inner)
      return t => outer(inner(t))
    }
    case 'step': return t => t < 1 ? 0 : 1
    default: return curves[ease.type]
  }
}
function resolveTime(t: Time, inputs: InputTable): number {
  if (typeof t === 'number')
    return t
  const v = inputs[t.input]
  if (v === undefined)
    throw new Error(`unknown input "${t.input}"`)
  return v
}

/* ------------------------------------------------------------------ */
/* tracks                                                              */

export interface CompiledTrack {
  /** value at the clip's normalized clock `phi`, inputs resolved per draw */
  at: (phi: number, inputs: InputTable) => number
  /** the track's local clock phase — what phase-gates compare against */
  phase: (phi: number, inputs: InputTable) => number
}

export function compileTrack(track: Track): CompiledTrack {
  if ('keys' in track) {
    const eases = track.keys.map((k) => {
      if (!k.ease)
        return null
      const ease = compileEase(k.ease)
      if (!k.window)
        // plain: the easing input is the key segment's progress
        return (_phi: number, _inputs: InputTable, segmentK: number) => ease(segmentK)
      // windowed ease: the easing input is seg(φ, w0, w1), not the key segment —
      // the imperative `ease(seg(p, a, b))` idiom with its own window
      const w0 = k.window.from
      const w1 = k.window.to
      return (phi: number, inputs: InputTable) => ease(seg(phi, resolveTime(w0, inputs), resolveTime(w1, inputs)))
    })
    const hasRate = track.rate !== undefined || track.offset !== undefined
    const rate = track.rate ?? 1
    const localPhase = (phi: number, inputs: InputTable): number => {
      if (!hasRate)
        return phi
      // local = (phi · rate + offset) % 1 — exactly the imperative loop phases'
      // plain `%` (an extra +1 wrap rounds 0.999…9 + 1 up to 2 and flips the phase)
      let local = phi * rate
      if (track.offset !== undefined)
        local += resolveTime(track.offset, inputs)
      return local % 1
    }
    return {
      phase: localPhase,
      at(phi, inputs) {
        const local = localPhase(phi, inputs)
        const keys = track.keys
        const first = keys[0]!
        const last = keys[keys.length - 1]!
        if (local <= resolveTime(first.at, inputs))
          return first.value
        if (local >= resolveTime(last.at, inputs))
          return last.value
        // scan segments from the end: at a boundary the LAST containing segment
        // owns the sample, which keeps intentionally discontinuous handoffs
        // (the ringStep entrance → wake jump) on their code-accurate side
        for (let i = keys.length - 2; i >= 0; i--) {
          const ka = keys[i]!
          const kb = keys[i + 1]!
          const a = resolveTime(ka.at, inputs)
          const b = resolveTime(kb.at, inputs)
          if (local >= a && local <= b) {
            // CSS/Lottie convention: a key's ease shapes the segment arriving at it
            const ease = eases[i + 1]
            const k = seg(local, a, b)
            // a windowed ease reads the raw clock through its own window
            const eased = ease ? ease(local, inputs, k) : k
            return lerp(ka.value, kb.value, eased)
          }
        }
        return last.value
      },
    }
  }
  if ('ease' in track) {
    const ease = compileEase(track.ease)
    return { at: phi => ease(phi), phase: phi => phi }
  }
  if (track.curve === 'bump') {
    const low = track.low ?? 0
    const high = track.high ?? 1
    const windows = track.windows
    return {
      phase: phi => phi,
      at(phi, inputs) {
        // max-combined bumps (the blink's overlapping windows)
        let v = 0
        for (const { from: a, to: b } of windows)
          v = Math.max(v, bump(phi, resolveTime(a, inputs), resolveTime(b, inputs)))
        return lerp(low, high, v)
      },
    }
  }
  if (track.curve === 'fade') {
    return { phase: p => p, at: p => p < 0 ? 1 : p >= 1 ? 0 : Math.max(0, track.drop - track.fall * p ** track.power) }
  }
  // damped
  const low = track.low ?? 0
  const high = track.high ?? 1
  const denom = 1 - Math.exp(-track.damping)
  return {
    phase: phi => phi,
    at(phi, inputs) {
      const u = seg(phi, resolveTime(track.from, inputs), resolveTime(track.to, inputs))
      const d = (1 - Math.exp(-track.damping * u)) / denom
      return lerp(low, high, d)
    },
  }
}

/* ------------------------------------------------------------------ */
/* value expressions                                                   */

type NumFn = (env: Env) => number

export function compileNum(expr: Value): NumFn {
  if (typeof expr === 'number')
    return () => expr
  if ('track' in expr) {
    const name = expr.track
    return env => env.track(name)
  }
  if ('input' in expr) {
    const name = expr.input
    return (env) => {
      const v = env.inputs[name]
      if (v === undefined)
        throw new Error(`unknown input "${name}"`)
      return v
    }
  }
  if ('lerp' in expr) {
    const fa = compileNum(expr.lerp.from)
    const fb = compileNum(expr.lerp.to)
    const ft = compileNum(expr.lerp.progress)
    return env => lerp(fa(env), fb(env), ft(env))
  }
  if ('add' in expr) {
    const terms = expr.add.map(compileNum)
    return (env) => {
      let sum = 0
      for (const term of terms) sum += term(env)
      return sum
    }
  }
  if ('multiply' in expr) {
    const terms = expr.multiply.map(compileNum)
    return (env) => {
      let product = 1
      for (const term of terms) product *= term(env)
      return product
    }
  }
  // clamp
  const inner = compileNum(expr.clamp.value)
  const min = expr.clamp.min ?? 0
  const max = expr.clamp.max ?? 1
  return env => clamp(inner(env), min, max)
}

export function compileColor(expr: Color): (env: Env, ctx: DrawContext) => string {
  if (typeof expr === 'string')
    return () => expr
  if ('shade' in expr) {
    const v = compileNum(expr.shade)
    return (env, ctx) => tone(ctx.palette, v(env))
  }
  if ('ring' in expr) {
    const v = compileNum(expr.ring)
    return (env, ctx) => ringTone(ctx.palette, v(env))
  }
  if ('grade' in expr)
    return (_, ctx) => ctx.grades[expr.grade]
  return (_, ctx) => expr.palette === 'ring' ? ringTone(ctx.palette, 50) : ctx.palette[400]
}

/* ------------------------------------------------------------------ */
/* gates                                                               */

interface CompiledGate {
  track?: string
  phase: boolean
  from?: Time
  until?: Time
  fromInclusive: boolean
  untilInclusive: boolean
}

export function compileGate(gate: Gate | undefined): CompiledGate | null {
  if (!gate)
    return null
  return {
    track: gate.track,
    phase: gate.phase ?? false,
    from: gate.from,
    until: gate.until,
    fromInclusive: gate.fromInclusive ?? false,
    untilInclusive: gate.untilInclusive ?? false,
  }
}

/** Strict by default — the imperative guards read `value > from && value < until`. */
export function gateOpen(gate: CompiledGate | null, phi: number, env: Env): boolean {
  if (!gate)
    return true
  const value = gate.track === undefined
    ? phi
    : gate.phase ? env.phase(gate.track) : env.track(gate.track)
  if (gate.from !== undefined) {
    const from = resolveTime(gate.from, env.inputs)
    const pass = gate.fromInclusive ? value >= from : value > from
    if (!pass)
      return false
  }
  if (gate.until !== undefined) {
    const until = resolveTime(gate.until, env.inputs)
    const pass = gate.untilInclusive ? value <= until : value < until
    if (!pass)
      return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* slice emission — mirrors notes/parts.ts field for field             */

type RingEdge = NonNullable<Extract<Frame, { type: 'ring' }>['edge']>

type PrimitiveFn = (env: Env, ctx: DrawContext) => SceneNode

export function compileTransform(t: TransformSpec): (env: Env) => Transform {
  const fields: [keyof TransformSpec, NumFn | null][] = [
    ['x', t.x !== undefined ? compileNum(t.x) : null],
    ['y', t.y !== undefined ? compileNum(t.y) : null],
    ['rotate', t.rotate !== undefined ? compileNum(t.rotate) : null],
    ['scale', t.scale !== undefined ? compileNum(t.scale) : null],
    ['scaleX', t.scaleX !== undefined ? compileNum(t.scaleX) : null],
    ['scaleY', t.scaleY !== undefined ? compileNum(t.scaleY) : null],
  ]
  return (env) => {
    const out: Transform = {}
    for (const [key, fn] of fields) {
      if (fn)
        out[key] = fn(env)
    }
    return out
  }
}

/**
 * The stepped edge falloff (`parts.edgeBands`): resolve an edge spec against
 * a band of `width` into abutting bands — ported exactly, including the
 * inside clamp and the skip branch's cursor advance.
 */
function edgeBands(width: number, edge: RingEdge): { offset: number, width: number, opacity: number }[] {
  const out: { offset: number, width: number, opacity: number }[] = []
  const inside = (edge.placement ?? 'inside') === 'inside'
  let cursor = 0
  for (const b of edge.bands) {
    let w = width * Math.max(0, b.fraction)
    if (inside)
      w = Math.min(w, width - cursor)
    if (!(w > 0) || !(b.opacity > 0)) {
      cursor += Math.max(0, w)
      continue
    }
    const c = cursor + w / 2
    out.push({ offset: inside ? -c : c, width: w, opacity: Math.min(1, b.opacity) })
    cursor += w
  }
  return out
}

/**
 * Ring primitive → `parts.assemblingRing` (and `dashedRing`, which is the
 * same code with a duty cycle): `segments` arcs growing from their centres,
 * a closed circle at k ≥ 0.999, edge bands riding the same motion.
 */
function emitRing(
  r: number,
  width: number,
  stroke: string,
  segments: number,
  k: number,
  spin: number,
  opacity: number,
  edge?: RingEdge,
): SceneNode {
  const closed = k >= 0.999
  const span = (Math.PI * 2) / segments
  const half = (span * k) / 2
  const band = (rr: number, w: number, color: string, o = 1): SceneNode =>
    closed
      ? { type: 'circle', r: Math.max(0, rr), stroke: color, strokeWidth: w, opacity: opacity * o }
      : {
          type: 'group',
          opacity: opacity * o,
          children: Array.from({ length: segments }, (_, i) => {
            const c = spin + i * span
            return { type: 'arc', r: rr, start: c - half, end: c + half, strokeWidth: w, stroke: color, cap: 'butt' } as SceneNode
          }),
        }
  const bands = edge ? edgeBands(width, edge) : []
  if (!bands.length)
    return band(r, width, stroke)
  const outer = r + width / 2
  return {
    type: 'group',
    children: [band(r, width, stroke), ...bands.map(b => band(outer + b.offset, b.width, edge!.color, b.opacity))],
  }
}

export function compilePrimitive(slice: Primitive): PrimitiveFn {
  const emit = compilePrimitiveBody(slice)
  if (!slice.blend)
    return emit
  const blend = slice.blend
  return (env, ctx) => {
    const node = emit(env, ctx)
    if (node)
      node.blend = blend
    return node
  }
}

function compilePrimitiveBody(slice: Primitive): PrimitiveFn {
  const opacity = slice.opacity !== undefined ? compileNum(slice.opacity) : null

  switch (slice.type) {
    case 'group': {
      const children = (slice.children ?? []).map(compilePrimitive)
      const transform = slice.transform ? compileTransform(slice.transform) : null
      const clip = slice.clip
        ? {
            r: compileNum(slice.clip.r),
            cx: slice.clip.cx !== undefined ? compileNum(slice.clip.cx) : null,
            cy: slice.clip.cy !== undefined ? compileNum(slice.clip.cy) : null,
          }
        : null
      const isolate = slice.isolate
      return (env, ctx) => {
        const kids: SceneNode[] = []
        for (const child of children) {
          const node = child(env, ctx)
          if (node)
            kids.push(node)
        }
        const node: SceneNode & Record<string, unknown> = { type: 'group', children: kids }
        if (opacity)
          node.opacity = opacity(env)
        if (isolate)
          node.isolate = true
        if (transform)
          node.transform = transform(env)
        if (clip) {
          node.clip = {
            type: 'circle',
            r: clip.r(env),
            ...(clip.cx ? { cx: clip.cx(env) } : {}),
            ...(clip.cy ? { cy: clip.cy(env) } : {}),
          }
        }
        return node
      }
    }
    case 'circle': {
      const r = compileNum(slice.r)
      const cx = slice.cx !== undefined ? compileNum(slice.cx) : null
      const cy = slice.cy !== undefined ? compileNum(slice.cy) : null
      const fillC = slice.fill !== undefined ? compileColor(slice.fill) : null
      const strokeC = slice.stroke !== undefined ? compileColor(slice.stroke) : null
      const strokeWidth = slice.strokeWidth !== undefined ? compileNum(slice.strokeWidth) : null
      return (env, ctx) => {
        // parts.disk / parts.ring clamp the radius at 0
        const node: SceneNode & Record<string, unknown> = { type: 'circle', r: Math.max(0, r(env)) }
        if (cx)
          node.cx = cx(env)
        if (cy)
          node.cy = cy(env)
        if (fillC)
          node.fill = fillC(env, ctx)
        if (strokeC)
          node.stroke = strokeC(env, ctx)
        if (strokeWidth)
          node.strokeWidth = strokeWidth(env)
        if (opacity)
          node.opacity = opacity(env)
        return node
      }
    }
    case 'arc': {
      const r = compileNum(slice.r)
      const start = compileNum(slice.start)
      const end = compileNum(slice.end)
      const cx = slice.cx !== undefined ? compileNum(slice.cx) : null
      const cy = slice.cy !== undefined ? compileNum(slice.cy) : null
      const strokeC = compileColor(slice.stroke!)
      const strokeWidth = compileNum(slice.strokeWidth!)
      return (env, ctx) => {
        // parts.arc: cap always set, opacity only when provided
        const node: SceneNode & Record<string, unknown> = {
          type: 'arc',
          r: r(env),
          start: start(env),
          end: end(env),
          strokeWidth: strokeWidth(env),
          stroke: strokeC(env, ctx),
          cap: slice.cap ?? 'butt',
        }
        if (cx)
          node.cx = cx(env)
        if (cy)
          node.cy = cy(env)
        if (opacity)
          node.opacity = opacity(env)
        return node
      }
    }
    case 'rect': {
      const x = compileNum(slice.x)
      const y = compileNum(slice.y)
      const w = compileNum(slice.w)
      const h = compileNum(slice.h)
      const rx = slice.rx !== undefined ? compileNum(slice.rx) : null
      const fillC = slice.fill !== undefined ? compileColor(slice.fill) : null
      const strokeC = slice.stroke !== undefined ? compileColor(slice.stroke) : null
      const strokeWidth = slice.strokeWidth !== undefined ? compileNum(slice.strokeWidth) : null
      return (env, ctx) => {
        const node: SceneNode & Record<string, unknown> = { type: 'rect', x: x(env), y: y(env), w: w(env), h: h(env) }
        if (rx)
          node.rx = rx(env)
        if (fillC)
          node.fill = fillC(env, ctx)
        if (strokeC)
          node.stroke = strokeC(env, ctx)
        if (strokeWidth)
          node.strokeWidth = strokeWidth(env)
        if (slice.join)
          node.join = slice.join
        if (slice.cap)
          node.cap = slice.cap
        if (opacity)
          node.opacity = opacity(env)
        return node
      }
    }
    case 'poly': {
      const points = slice.points.map(({ x, y }) => [compileNum(x), compileNum(y)] as const)
      const fillC = slice.fill !== undefined ? compileColor(slice.fill) : null
      const strokeC = slice.stroke !== undefined ? compileColor(slice.stroke) : null
      const strokeWidth = slice.strokeWidth !== undefined ? compileNum(slice.strokeWidth) : null
      return (env, ctx) => {
        const node: SceneNode & Record<string, unknown> = {
          type: 'poly',
          points: points.map(([px, py]) => [px(env), py(env)] as [number, number]),
        }
        if (slice.closed)
          node.closed = true
        if (fillC)
          node.fill = fillC(env, ctx)
        if (strokeC)
          node.stroke = strokeC(env, ctx)
        if (strokeWidth)
          node.strokeWidth = strokeWidth(env)
        if (slice.join)
          node.join = slice.join
        if (slice.cap)
          node.cap = slice.cap
        if (opacity)
          node.opacity = opacity(env)
        return node
      }
    }
    case 'line': {
      const x1 = compileNum(slice.x1)
      const y1 = compileNum(slice.y1)
      const x2 = compileNum(slice.x2)
      const y2 = compileNum(slice.y2)
      const strokeC = compileColor(slice.stroke!)
      const strokeWidth = compileNum(slice.strokeWidth!)
      return (env, ctx) => {
        const node: SceneNode & Record<string, unknown> = {
          type: 'line',
          x1: x1(env),
          y1: y1(env),
          x2: x2(env),
          y2: y2(env),
          stroke: strokeC(env, ctx),
          strokeWidth: strokeWidth(env),
        }
        if (slice.cap)
          node.cap = slice.cap
        if (slice.join)
          node.join = slice.join
        if (opacity)
          node.opacity = opacity(env)
        return node
      }
    }
    case 'ring': {
      const r = compileNum(slice.r)
      const width = compileNum(slice.width)
      const assemble = compileNum(slice.assemble)
      const spin = slice.spin !== undefined ? compileNum(slice.spin) : null
      const strokeC = compileColor(slice.stroke!)
      const segments = slice.segments
      const edge = slice.edge
      return (env, ctx) => {
        return emitRing(r(env), width(env), strokeC(env, ctx), segments, assemble(env), spin ? spin(env) : 0, opacity ? opacity(env) : 1, edge)
      }
    }
  }
}

export interface Env {
  inputs: InputTable
  track: (name: string) => number
  phase: (name: string) => number
}

export function makeEnv(inputs: InputTable, tracks: Map<string, CompiledTrack>, phi: number): Env {
  const values = new Map<string, number>()
  const phases = new Map<string, number>()
  return {
    inputs,
    track(name) {
      let v = values.get(name)
      if (v === undefined) {
        const track = tracks.get(name)
        if (!track)
          throw new Error(`unknown track "${name}"`)
        v = track.at(phi, inputs)
        values.set(name, v)
      }
      return v
    },
    phase(name) {
      let v = phases.get(name)
      if (v === undefined) {
        const track = tracks.get(name)
        if (!track)
          throw new Error(`unknown track "${name}"`)
        v = track.phase(phi, inputs)
        phases.set(name, v)
      }
      return v
    },
  }
}
