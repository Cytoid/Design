/**
 * Skin interpreter — the TS reference implementation of the skin format.
 *
 * Two phases, mirroring how the C# side will load skins:
 *  1. `compileSkin` validates (zod), resolves references and freezes each
 *     clip into closure trees — the hot path does no dictionary lookups on
 *     skin data and never reflects.
 *  2. Each `draw` evaluates the clip's named tracks once against the clip's
 *     driver, walks the layer tree and emits a fresh `SceneNode` tree —
 *     exactly the tree the imperative designs built (same node shapes, same
 *     field presence, same gated-out absences). Fresh objects every call:
 *     consumers (the baker) keep trees around.
 *
 * Emission deliberately mirrors `notes/parts.ts` helper output field for
 * field — the golden tests lock that in.
 */
import type { SceneNode, Transform } from '../core/scene'
import type { Clip, DrawContext, NoteDesign } from '../notes/types'
import type { NoteKind } from '../tokens'
import type { AnchorTable } from './anchors'
import type { ColorExpr, EaseSpec, EdgeSpec, Gate, NumExpr, Skin, SkinClip, SkinNote, Slice, TimeRef, Track, TransformExpr } from './schema'
import { bump, clamp, cubicBezier, inCubic, inExpo, inOutCubic, inOutQuad, inOutSine, inQuad, inSine, lerp, linear, outCubic, outExpo, outQuad, outQuart, outQuint, outSine, seg } from '../core/ease'
import { ringTone, tone } from '../palette'
import { tokens } from '../tokens'
import { resolveAnchors } from './anchors'

/* ------------------------------------------------------------------ */
/* easing                                                              */

type EaseFn = (t: number) => number

const outPow = (t: number, p: number): number => 1 - (1 - t) ** p
const inPow = (t: number, p: number): number => t ** p

/** Named eases: exactly `core/ease.ts`, plus the parameterized power/back curves. */
const NAMED: Record<string, (param?: number) => EaseFn> = {
  linear: () => linear,
  inQuad: () => inQuad,
  outQuad: () => outQuad,
  inSine: () => inSine,
  outSine: () => outSine,
  inOutSine: () => inOutSine,
  inOutQuad: () => inOutQuad,
  inCubic: () => inCubic,
  outCubic: () => outCubic,
  inOutCubic: () => inOutCubic,
  outQuart: () => outQuart,
  outQuint: () => outQuint,
  inExpo: () => inExpo,
  outExpo: () => outExpo,
  outBack: (s = 1.70158) => t => outBack(t, s),
  outPow: (p = 2) => t => outPow(t, p),
  inPow: (p = 2) => t => inPow(t, p),
}

function outBack(t: number, s: number): number {
  const c3 = s + 1
  return 1 + c3 * (t - 1) ** 3 + s * (t - 1) ** 2
}

function parseEase(spec: EaseSpec): EaseFn {
  if (Array.isArray(spec))
    return cubicBezier(spec[0], spec[1], spec[2], spec[3])
  const open = spec.indexOf('(')
  if (open < 0) {
    const factory = NAMED[spec]
    if (!factory)
      throw new Error(`unknown ease "${spec}"`)
    return factory()
  }
  if (!spec.endsWith(')'))
    throw new Error(`malformed ease "${spec}"`)
  const outerName = spec.slice(0, open)
  const factory = NAMED[outerName]
  if (!factory)
    throw new Error(`unknown ease "${spec}"`)
  const innerSpec = spec.slice(open + 1, -1)
  const param = Number(innerSpec)
  if (Number.isFinite(param))
    return factory(param)
  // composition: "outQuart(outCubic)" — the outer function of the inner easing
  const inner = parseEase(innerSpec)
  const outer = factory()
  return (t: number) => outer(inner(t))
}

function resolveTime(t: TimeRef, anchors: AnchorTable): number {
  if (typeof t === 'number')
    return t
  const v = anchors[t.anchor]
  if (v === undefined)
    throw new Error(`unknown anchor "${t.anchor}"`)
  return v
}

/* ------------------------------------------------------------------ */
/* tracks                                                              */

interface CompiledTrack {
  /** value at the clip's normalized clock `phi`, anchors resolved per draw */
  at: (phi: number, anchors: AnchorTable) => number
  /** the track's local clock phase — what phase-gates compare against */
  phase: (phi: number, anchors: AnchorTable) => number
}

function compileTrack(track: Track): CompiledTrack {
  if ('keys' in track) {
    const eases = track.keys.map((k) => {
      if (!k.ease)
        return null
      const ease = parseEase(k.ease)
      if (!k.window)
        // plain: the easing input is the key segment's progress
        return (_phi: number, _anchors: AnchorTable, segmentK: number) => ease(segmentK)
      // windowed ease: the easing input is seg(φ, w0, w1), not the key segment —
      // the imperative `ease(seg(p, a, b))` idiom with its own window
      const w0 = k.window[0]!
      const w1 = k.window[1]!
      return (phi: number, anchors: AnchorTable) => ease(seg(phi, resolveTime(w0, anchors), resolveTime(w1, anchors)))
    })
    const hasRate = track.rate !== undefined || track.offset !== undefined
    const rate = track.rate ?? 1
    const localPhase = (phi: number, anchors: AnchorTable): number => {
      if (!hasRate)
        return phi
      // local = (phi · rate + offset) % 1 — exactly the imperative loop phases'
      // plain `%` (an extra +1 wrap rounds 0.999…9 + 1 up to 2 and flips the phase)
      let local = phi * rate
      if (track.offset !== undefined)
        local += resolveTime(track.offset, anchors)
      return local % 1
    }
    return {
      phase: localPhase,
      at(phi, anchors) {
        const local = localPhase(phi, anchors)
        const keys = track.keys
        const first = keys[0]!
        const last = keys[keys.length - 1]!
        if (local <= resolveTime(first.at, anchors))
          return first.value
        if (local >= resolveTime(last.at, anchors))
          return last.value
        // scan segments from the end: at a boundary the LAST containing segment
        // owns the sample, which keeps intentionally discontinuous handoffs
        // (the ringStep entrance → wake jump) on their code-accurate side
        for (let i = keys.length - 2; i >= 0; i--) {
          const ka = keys[i]!
          const kb = keys[i + 1]!
          const a = resolveTime(ka.at, anchors)
          const b = resolveTime(kb.at, anchors)
          if (local >= a && local <= b) {
            // CSS/Lottie convention: a key's ease shapes the segment arriving at it
            const ease = eases[i + 1]
            const k = seg(local, a, b)
            // a windowed ease reads the raw clock through its own window
            const eased = ease ? ease(local, anchors, k) : k
            return lerp(ka.value, kb.value, eased)
          }
        }
        return last.value
      },
    }
  }
  if ('ease' in track) {
    const ease = parseEase(track.ease)
    return { at: phi => ease(phi), phase: phi => phi }
  }
  if (track.curve === 'bump') {
    const low = track.low ?? 0
    const high = track.high ?? 1
    const windows = track.windows.map(([a, b]) => [a, b] as const)
    return {
      phase: phi => phi,
      at(phi, anchors) {
        // max-combined bumps (the blink's overlapping windows)
        let v = 0
        for (const [a, b] of windows)
          v = Math.max(v, bump(phi, resolveTime(a, anchors), resolveTime(b, anchors)))
        return lerp(low, high, v)
      },
    }
  }
  // damped
  const low = track.low ?? 0
  const high = track.high ?? 1
  const denom = 1 - Math.exp(-track.damping)
  return {
    phase: phi => phi,
    at(phi, anchors) {
      const u = seg(phi, resolveTime(track.from, anchors), resolveTime(track.to, anchors))
      const d = (1 - Math.exp(-track.damping * u)) / denom
      return lerp(low, high, d)
    },
  }
}

/* ------------------------------------------------------------------ */
/* value expressions                                                   */

type NumFn = (env: Env) => number

function compileNum(expr: NumExpr): NumFn {
  if (typeof expr === 'number')
    return () => expr
  if ('track' in expr) {
    const name = expr.track
    return env => env.track(name)
  }
  if ('anchor' in expr) {
    const name = expr.anchor
    return (env) => {
      const v = env.anchors[name]
      if (v === undefined)
        throw new Error(`unknown anchor "${name}"`)
      return v
    }
  }
  if ('lerp' in expr) {
    const fa = compileNum(expr.lerp[0]!)
    const fb = compileNum(expr.lerp[1]!)
    const ft = compileNum(expr.lerp[2]!)
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
  if ('mul' in expr) {
    const terms = expr.mul.map(compileNum)
    return (env) => {
      let product = 1
      for (const term of terms) product *= term(env)
      return product
    }
  }
  // clamp
  const inner = compileNum(expr.clamp)
  const min = expr.min ?? 0
  const max = expr.max ?? 1
  return env => clamp(inner(env), min, max)
}

function compileColor(expr: ColorExpr): (env: Env, ctx: DrawContext) => string {
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
  const grade = expr.game
  return (_, ctx) => ctx.grades[grade]
}

/* ------------------------------------------------------------------ */
/* gates                                                               */

interface CompiledGate {
  track?: string
  phase: boolean
  from?: TimeRef
  until?: TimeRef
  fromInclusive: boolean
  untilInclusive: boolean
}

function compileGate(gate: Gate | undefined): CompiledGate | null {
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
function gateOpen(gate: CompiledGate | null, phi: number, env: Env): boolean {
  if (!gate)
    return true
  const value = gate.track === undefined
    ? phi
    : gate.phase ? env.phase(gate.track) : env.track(gate.track)
  if (gate.from !== undefined) {
    const from = resolveTime(gate.from, env.anchors)
    const pass = gate.fromInclusive ? value >= from : value > from
    if (!pass)
      return false
  }
  if (gate.until !== undefined) {
    const until = resolveTime(gate.until, env.anchors)
    const pass = gate.untilInclusive ? value <= until : value < until
    if (!pass)
      return false
  }
  return true
}

/* ------------------------------------------------------------------ */
/* slice emission — mirrors notes/parts.ts field for field             */

type SliceFn = (env: Env, ctx: DrawContext, phi: number) => SceneNode | null

function compileTransform(t: TransformExpr): (env: Env) => Transform {
  const fields: [keyof TransformExpr, NumFn | null][] = [
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
function edgeBands(width: number, edge: EdgeSpec): { offset: number, width: number, opacity: number }[] {
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
  edge?: EdgeSpec,
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

function compileSlice(slice: Slice): SliceFn {
  if (slice.type === 'switch') {
    const gateS = compileGate(slice.gate)
    const thenFn = compileSlice(slice.then)
    const elseFn = slice.else ? compileSlice(slice.else) : null
    return (env, ctx, phi) => {
      if (gateOpen(gateS, phi, env))
        return thenFn(env, ctx, phi)
      return elseFn ? elseFn(env, ctx, phi) : null
    }
  }

  const gate = compileGate(slice.gate)
  const opacity = slice.opacity !== undefined ? compileNum(slice.opacity) : null

  switch (slice.type) {
    case 'group': {
      const children = slice.children.map(compileSlice)
      const transform = slice.transform ? compileTransform(slice.transform) : null
      const clip = slice.clip
        ? {
            r: compileNum(slice.clip.r),
            cx: slice.clip.cx !== undefined ? compileNum(slice.clip.cx) : null,
            cy: slice.clip.cy !== undefined ? compileNum(slice.clip.cy) : null,
          }
        : null
      const isolate = slice.isolate
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
        const kids: SceneNode[] = []
        for (const child of children) {
          const node = child(env, ctx, phi)
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
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
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
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
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
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
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
      const points = slice.points.map(([px, py]) => [compileNum(px), compileNum(py)] as const)
      const fillC = slice.fill !== undefined ? compileColor(slice.fill) : null
      const strokeC = slice.stroke !== undefined ? compileColor(slice.stroke) : null
      const strokeWidth = slice.strokeWidth !== undefined ? compileNum(slice.strokeWidth) : null
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
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
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
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
      return (env, ctx, phi) => {
        if (!gateOpen(gate, phi, env))
          return null
        return emitRing(r(env), width(env), strokeC(env, ctx), segments, assemble(env), spin ? spin(env) : 0, opacity ? opacity(env) : 1, edge)
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* clips                                                               */

interface CompiledClip {
  mode: SkinClip['mode']
  duration: number
  note?: string
  root?: {
    opacity: NumFn | null
    transform: ((env: Env) => Transform) | null
    /** exit composite: the alpha curve replaces the root opacity */
    alpha?: { drop: number, fall: number, power: number }
    isolate: boolean
  }
  tracks: Map<string, CompiledTrack>
  layers: SliceFn[]
  /** exit composite: re-draw the enter slot rewound under the alpha curve */
  rewind?: { speed: number }
}

/** The clip's normalized clock: what tracks and phase gates evaluate against. */
function clipPhi(mode: SkinClip['mode'], duration: number, x: number): number {
  switch (mode) {
    case 'normalized':
    case 'progress':
      return x
    case 'once':
      return x / duration
    case 'loop':
      // exactly the imperative expression — mod-then-divide vs divide-then-mod
      // round differently at period boundaries, and presence gates see that
      return (((x % duration) + duration) % duration) / duration
    case 'static':
      return 0
  }
}

function compileClip(clip: SkinClip): CompiledClip {
  if (clip.frames !== undefined)
    throw new Error('frame-animation slots are not supported in skin v1 (the kind falls back to the built-in design)')
  if (clip.rewind && !clip.alpha)
    throw new Error('a rewind slot needs an alpha curve')
  const tracks = new Map<string, CompiledTrack>()
  for (const [name, track] of Object.entries(clip.tracks ?? {}))
    tracks.set(name, compileTrack(track))
  let root: CompiledClip['root']
  if (clip.rewind) {
    root = {
      opacity: null,
      transform: null,
      alpha: clip.alpha ? { drop: clip.alpha.drop, fall: clip.alpha.fall, power: clip.alpha.power } : undefined,
      isolate: true,
    }
  }
  else if (clip.root) {
    root = {
      opacity: clip.root.opacity !== undefined ? compileNum(clip.root.opacity) : null,
      transform: clip.root.transform ? compileTransform(clip.root.transform) : null,
      isolate: clip.root.isolate ?? false,
    }
  }
  return {
    mode: clip.mode,
    duration: clip.duration,
    note: clip.note,
    root,
    tracks,
    layers: clip.layers.map(compileSlice),
    rewind: clip.rewind ? { speed: clip.rewind.speed } : undefined,
  }
}

interface Env {
  anchors: AnchorTable
  track: (name: string) => number
  phase: (name: string) => number
}

function makeEnv(anchors: AnchorTable, tracks: Map<string, CompiledTrack>, phi: number): Env {
  const values = new Map<string, number>()
  const phases = new Map<string, number>()
  return {
    anchors,
    track(name) {
      let v = values.get(name)
      if (v === undefined) {
        const track = tracks.get(name)
        if (!track)
          throw new Error(`unknown track "${name}"`)
        v = track.at(phi, anchors)
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
        v = track.phase(phi, anchors)
        phases.set(name, v)
      }
      return v
    },
  }
}

/** `effects.exitAlpha`: drop − fall·p^power over the clip's duration, 1 before the hit. */
function exitAlpha(t: number, duration: number, alpha: { drop: number, fall: number, power: number }): number {
  if (t < 0)
    return 1
  const p = t / duration
  return p >= 1 ? 0 : Math.max(0, alpha.drop - alpha.fall * p ** alpha.power)
}

function drawClip(compiled: CompiledClip, enter: CompiledClip | null, x: number, ctx: DrawContext): SceneNode {
  if (compiled.rewind && enter) {
    // exit: the enter animation rewinds at `speed` × its real approach speed
    // (absolute seconds since the chart hit time) under the alpha curve
    const p = Math.max(0, 1 - Math.max(0, x) * compiled.rewind.speed / Math.max(1e-6, ctx.approach))
    const inner = drawClip(enter, null, p, ctx)
    return { type: 'group', opacity: exitAlpha(x, compiled.duration, compiled.root!.alpha!), isolate: true, children: [inner] }
  }
  const phi = clipPhi(compiled.mode, compiled.duration, x)
  const env = makeEnv(resolveAnchors(ctx), compiled.tracks, phi)
  const kids: SceneNode[] = []
  for (const layer of compiled.layers) {
    const node = layer(env, ctx, phi)
    if (node)
      kids.push(node)
  }
  const node: SceneNode & Record<string, unknown> = { type: 'group', children: kids }
  if (compiled.root) {
    if (compiled.root.alpha) {
      node.opacity = exitAlpha(x, compiled.duration, compiled.root.alpha)
      node.isolate = true
    }
    else {
      if (compiled.root.opacity)
        node.opacity = compiled.root.opacity(env)
      if (compiled.root.isolate)
        node.isolate = true
    }
    if (compiled.root.transform)
      node.transform = compiled.root.transform(env)
  }
  return node
}

export interface CompiledSlot {
  mode: SkinClip['mode']
  duration: number
  note?: string
  draw: (x: number, ctx: DrawContext) => SceneNode
}

function buildSlot(clip: SkinClip, compiled: CompiledClip, enter: CompiledClip | null): CompiledSlot {
  return {
    mode: compiled.mode,
    duration: compiled.duration,
    note: compiled.note,
    draw: (x, ctx) => drawClip(compiled, enter, x, ctx),
  }
}

/* ------------------------------------------------------------------ */
/* skin → designs                                                      */

/**
 * Exit curves a skin may reference — exactly the engine's `tokens.time.exit`
 * (v1 skins cannot change clip durations: the player, Lab and baker schedule
 * effects off the engine tokens, so a divergent duration would be cut short).
 */
const EXIT_CURVES: { name: string, curve: { duration: number, drop: number, fall: number, power: number } }[] = [
  { name: 'tap', curve: tokens.time.exit.tap },
  { name: 'holdHead', curve: tokens.time.exit.holdHead },
  { name: 'holdBody', curve: tokens.time.exit.holdBody },
  { name: 'dragChild', curve: tokens.time.exit.dragChild },
]

/**
 * v1 slot durations are pinned to the engine tokens (see `EXIT_CURVES`) — a
 * skin that diverges is rejected here so the loader can fall back to the
 * built-in design wholesale.
 */
function validateKind(kind: string, note: SkinNote): void {
  if (note.enter.frames !== undefined)
    throw new Error(`${kind}.enter: ${'frames'} slots are not supported in skin v1`)
  const expect = (slot: SkinClip, want: number, what: string) => {
    if (slot.duration !== want)
      throw new Error(`${kind}.${what}: duration ${slot.duration} must match the engine's ${want}s (v1 skins cannot retime clips)`)
  }
  expect(note.enter, tokens.time.enter, 'enter')
  for (const grade of ['perfect', 'great', 'good', 'bad'] as const)
    expect(note.clear[grade], tokens.time.clear[grade], `clear.${grade}`)
  if (note.miss)
    expect(note.miss, tokens.time.clear.miss, 'miss')
  if (note.exit) {
    const match = EXIT_CURVES.some(({ curve }) =>
      note.exit!.duration === curve.duration
      && note.exit!.alpha!.drop === curve.drop
      && note.exit!.alpha!.fall === curve.fall
      && note.exit!.alpha!.power === curve.power)
    if (!match)
      throw new Error(`${kind}.exit: curve must be one of the engine exit curves (tokens.time.exit)`)
  }
  if (note.hold) {
    expect(note.hold.press, tokens.time.holdPress, 'hold.press')
    if (note.hold.loopUnder)
      expect(note.hold.loopUnder, tokens.time.holdLoop, 'hold.loopUnder')
    if (note.hold.loopOver)
      expect(note.hold.loopOver, tokens.time.holdLoop, 'hold.loopOver')
    expect(note.hold.progress, 1, 'hold.progress')
  }
}

/**
 * Compile a validated skin into drop-in `NoteDesign`s. Clip ids and metadata
 * match the imperative designs exactly (`'enter'`, `'clear-perfect'`,
 * `'hold-press'`…), so Lab, the baker and the player see no difference.
 */
export function compileSkin(skin: Skin): Record<NoteKind, NoteDesign> {
  for (const [kind, note] of Object.entries(skin.notes))
    validateKind(kind, note)
  const designs = {} as Record<NoteKind, NoteDesign>
  for (const kind of Object.keys(skin.notes) as NoteKind[])
    designs[kind] = compileKind(kind, skin.notes[kind])
  return designs
}

function compileKind(kind: NoteKind, note: SkinNote): NoteDesign {
  const enterC = compileClip(note.enter)
  const enterSlot = buildSlot(note.enter, enterC, null)

  const clear = {} as Record<'perfect' | 'great' | 'good' | 'bad', CompiledSlot>
  for (const grade of ['perfect', 'great', 'good', 'bad'] as const) {
    const c = compileClip(note.clear[grade])
    clear[grade] = buildSlot(note.clear[grade], c, null)
  }

  const design: NoteDesign = {
    kind,
    enter: toClip('enter', enterSlot),
    clear: {
      perfect: toClip('clear-perfect', clear.perfect),
      great: toClip('clear-great', clear.great),
      good: toClip('clear-good', clear.good),
      bad: toClip('clear-bad', clear.bad),
    },
  }
  if (note.exit)
    design.exit = toClip('exit', buildSlot(note.exit, compileClip(note.exit), enterC))
  if (note.miss)
    design.miss = toClip('miss', buildSlot(note.miss, compileClip(note.miss), null))
  if (note.hold) {
    design.hold = {
      press: toClip('hold-press', buildSlot(note.hold.press, compileClip(note.hold.press), null)),
      ...(note.hold.loopUnder
        ? { loopUnder: toClip('hold-loop-under', buildSlot(note.hold.loopUnder, compileClip(note.hold.loopUnder), null)) }
        : {}),
      ...(note.hold.loopOver
        ? { loopOver: toClip('hold-loop-over', buildSlot(note.hold.loopOver, compileClip(note.hold.loopOver), null)) }
        : {}),
      progress: toClip('hold-progress', buildSlot(note.hold.progress, compileClip(note.hold.progress), null)),
    }
  }
  return design
}

function toClip(id: string, slot: CompiledSlot): Clip {
  return { id, mode: slot.mode, duration: slot.duration, note: slot.note, draw: slot.draw }
}
