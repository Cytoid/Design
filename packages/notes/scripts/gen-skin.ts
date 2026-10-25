import type { ColorExpr, EaseSpec, Gate, NumExpr, Skin, SkinClip, Slice, TimeRef, Track } from '../src/skin/schema'
/**
 * Flat skin generator — the authoring tool that transcribes the imperative
 * note designs into `src/skin/flat.skin.json`.
 *
 * The JSON it emits is the runtime truth source (committed, hand-reviewable);
 * this script exists so the transcription stays checkable against the
 * constants it came from and so shard randomness (mulberry32) can be expanded
 * into fixed per-slice numbers at authoring time — the skin format itself has
 * no random primitive.
 *
 * Run: pnpm --filter @cytoid/notes gen-skin
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv } from 'node:process'
import { rng } from '../src/core/ease'
import { tokens } from '../src/tokens'

/* ------------------------------------------------------------------ */
/* authoring helpers                                                   */

const TAU = Math.PI * 2
const C45 = Math.cos(Math.PI / 4)

const n = (v: number): NumExpr => v
const add = (...xs: NumExpr[]): NumExpr => xs.length === 1 ? xs[0]! : ({ add: xs })
const mul = (...xs: NumExpr[]): NumExpr => xs.length === 1 ? xs[0]! : ({ mul: xs })
const lerp = (a: NumExpr, b: NumExpr, t: NumExpr): NumExpr => ({ lerp: [a, b, t] })
const clamp = (v: NumExpr, max = 1, min = 0): NumExpr => ({ clamp: v, min, max })
/** context anchor reference */
const A = (name: string): NumExpr => ({ anchor: name })
/** named track reference */
const T = (name: string): NumExpr => ({ track: name })

interface Key { at: TimeRef, value: number, ease?: EaseSpec }
const key = (at: TimeRef, value: number, ease?: EaseSpec): Key => ease ? { at, value, ease } : { at, value }
const keys = (defs: Key[], extra: { offset?: TimeRef, rate?: number } = {}): Track => ({ keys: defs, ...extra })
const bump = (windows: [TimeRef, TimeRef][]): Track => ({ curve: 'bump', windows })
const damped = (o: { from: TimeRef, to: TimeRef, turns: number, damping: number, low: number, high: number }): Track => ({ curve: 'damped', ...o })

const gate = (g: Gate): Gate => g
const R = A('R')
const W = A('W')
const INNER = A('inner')
const RING_C = A('ringC')
const INNER_HALF = A('innerHalf')
const HAIR = A('hair')
const UNIT = A('unit')
const SIZE = A('size')
const HEADING = A('heading')

/**
 * The design's stepped edge falloff (`tokens.stroke.edge`), embedded per skin.
 * Overridable per build (`buildFlatSkin(edge)`) so dev sheets can compare
 * falloff variants; the manual band stacks (drag child, drop capsules, flick
 * outline) derive their geometry from the same spec.
 */
let EDGE: { color: string, placement: 'inside' | 'outside', bands: { fraction: number, opacity: number }[] } = {
  color: tokens.edge,
  placement: 'outside',
  bands: [
    { fraction: 0.10, opacity: 0.9 },
    { fraction: 0.10, opacity: 0.5 },
    { fraction: 0.10, opacity: 0.2 },
  ],
}

/**
 * Resolve an edge spec against a unit band width into fractions — the same
 * math as `parts.edgeBands` at width = 1 (inside bands clamp to the band,
 * abutting, never overlapping).
 */
function resolvedBands(): { frac: number, off: number, opacity: number }[] {
  const out: { frac: number, off: number, opacity: number }[] = []
  const inside = (EDGE.placement ?? 'inside') === 'inside'
  let cursor = 0
  for (const b of EDGE.bands) {
    let w = Math.max(0, b.fraction)
    if (inside)
      w = Math.min(w, 1 - cursor)
    if (!(w > 0) || !(b.opacity > 0)) {
      cursor += Math.max(0, w)
      continue
    }
    const c = cursor + w / 2
    out.push({ frac: w, off: inside ? -c : c, opacity: Math.min(1, b.opacity) })
    cursor += w
  }
  return out
}

/* timing tables, transcribed from the imperative designs */
const CLICK_TIMING = { splitFrom: 0.4, splitTo: 0.85, coreFrom: 0.42, coreFull: 0.94, approachFrom: 0.7, frameFrom: 0.7, readyBlinkFrom: 0.86, blinkFrom: 0.92 }
const WAKE = { from: 0.45, to: 0.7 }
const HOLD_WAKE = { from: 0.3, to: 0.85 }
const SIZE_S: [number, number, number, number] = [tokens.sizeCurve.s[0], 0, tokens.sizeCurve.s[1], 1]
const EXIT = tokens.time.exit
const CLEAR_TIME = tokens.time.clear

/** enter-size rise/settle as keyframes (`riseSettleCurve` is exactly two bezier segments). */
function riseSettle(curve: { spawn: number, peak: number, peakP: number, settleP: number }): Track {
  return keys([
    key(0, curve.spawn),
    key(curve.peakP, curve.peak, SIZE_S),
    key(curve.settleP, 1, SIZE_S),
  ])
}

/** diamond (square rotated 45°) as a poly slice — `parts.diamond`. */
function diamond(r: NumExpr, style: { fill?: ColorExpr, stroke?: ColorExpr, strokeWidth?: NumExpr, opacity?: NumExpr }): Slice {
  return {
    type: 'poly',
    points: [[n(0), mul(r, -1)], [r, n(0)], [n(0), r], [mul(r, -1), n(0)]],
    closed: true,
    join: 'miter',
    ...style,
  }
}

/** horizontal capsule as a rect slice — `parts.capsule`. */
function capsule(w: NumExpr, h: NumExpr, style: { fill?: ColorExpr, stroke?: ColorExpr, strokeWidth?: NumExpr, opacity?: NumExpr }): Slice {
  return { type: 'rect', x: mul(w, -0.5), y: mul(h, -0.5), w, h, rx: mul(h, 0.5), ...style }
}

/** flick chevron ">" with its tip at (tip, 0), 90° opening — `parts.flickChevron`. */
function flickChevron(tip: NumExpr, half: NumExpr, width: NumExpr, stroke: ColorExpr, opacity: NumExpr): Slice {
  return {
    type: 'poly',
    points: [[add(tip, mul(half, -1)), mul(half, -1)], [tip, n(0)], [add(tip, mul(half, -1)), half]],
    stroke,
    strokeWidth: width,
    join: 'miter',
    opacity,
  }
}

/* ------------------------------------------------------------------ */
/* shard expansion — fixed values in place of the RNG                  */

interface ShardParams { a: number, reach: number, delay: number, life: number, sizeMul: number, dir: number }

/**
 * Per-item shard params, sampled exactly like the (fixed) `parts.shards`:
 * six mulberry32 draws per item, in order — angle, reach, delay, life,
 * size multiplier, spin direction. Runs once at generation; the JSON carries
 * the numbers.
 */
function shardParams(count: number, seed: number, sectors?: [number, number][]): ShardParams[] {
  const rand = rng(seed)
  const items: ShardParams[] = []
  for (let i = 0; i < count; i++) {
    let a: number
    if (sectors) {
      const s = sectors[i % sectors.length]!
      a = s[0] + (s[1] - s[0]) * rand()
    }
    else {
      a = ((i + rand() * 0.8) / count) * TAU
    }
    items.push({
      a,
      reach: 0.55 + (1 - 0.55) * rand(),
      delay: rand() * 0.12,
      life: 0.55 + (0.86 - 0.55) * rand(),
      sizeMul: 0.6 + (1.2 - 0.6) * rand(),
      dir: rand() > 0.5 ? 1 : -1,
    })
  }
  return items
}

/* ------------------------------------------------------------------ */
/* clear effect transcription (`effects.clearEffect`)                  */

type EffectShape = 'circle' | 'diamond' | 'capsule'
interface ClearFlavor {
  shape: EffectShape
  capsule?: { w: number, h: number }
  reach: number
  sectors: number
  extra?: 'streaks' | 'beam' | 'double'
  flash?: 'note' | 'tail'
  seed: number
}

const GRADE_SCALE = {
  perfect: { reach: 1, shards: 6, sector: true },
  great: { reach: 0.9, shards: 4, sector: true },
  good: { reach: 0.75, shards: 3, sector: false },
  bad: { reach: 0.6, shards: 0, sector: false },
} as const
const FLICK_ARROWS = { perfect: 3, great: 2, good: 1, bad: 1 } as const

type ClearGrade = 'perfect' | 'great' | 'good' | 'bad'

function clearClip(flavor: ClearFlavor, grade: ClearGrade): SkinClip {
  const g = GRADE_SCALE[grade]
  const gc: ColorExpr = { game: grade }
  const reach = 1 + (flavor.reach - 1) * g.reach
  const cap = flavor.capsule

  /* shared tracks (u = t / duration) */
  const tracks: Record<string, Track> = {
    // 1. core flash: grow = lerp(1, 1.08, outCubic(u/0..0.32)) · (1 − outQuad(u 0.12–0.32))
    g1: keys([key(0, 0), key(0.32, 1, 'outCubic')]),
    g2: keys([key(0.12, 0), key(0.32, 1, 'outQuad')]),
    f3: keys([key(0.2, 0), key(0.32, 1)]),
    // 2. shock ring
    sk: keys([key(0, 0), key(0.85, 1, 'outExpo')]),
    oq: { ease: 'outQuint' },
    // 3. second ring
    s1: keys([key(0.08, 0), key(0.9, 1, 'outQuart')]),
    s2: keys([key(0.08, 0), key(0.9, 1)]),
    s3: keys([key(0.4, 0), key(0.95, 1)]),
    // 4. sector ring
    secK: keys([key(0.05, 0), key(1, 1, 'outQuart')]),
    secF: keys([key(0.5, 0), key(0.725, 1)]),
  }
  const grow = mul(add(1, mul(0.08, T('g1'))), lerp(1, 0, T('g2')))

  /* shape helpers — `effects.outline` / `effects.solid`, which divide the
     radius by R before sizing a capsule, so these take the *ratio* (radius/R). */
  const solid = (ratio: NumExpr, opacity: NumExpr): Slice => {
    if (flavor.shape === 'diamond')
      return diamond(mul(R, ratio), { fill: gc, opacity })
    if (flavor.shape === 'capsule')
      return capsule(mul(SIZE, cap!.w, ratio), mul(SIZE, cap!.h, ratio), { fill: gc, opacity })
    return { type: 'circle', r: mul(R, ratio), fill: gc, opacity }
  }
  const outline = (ratio: NumExpr, width: NumExpr, opacity: NumExpr): Slice => {
    if (flavor.shape === 'diamond')
      return diamond(mul(R, ratio), { stroke: gc, strokeWidth: width, opacity })
    if (flavor.shape === 'capsule') {
      const w = add(mul(SIZE, cap!.w, ratio), width)
      const h = add(mul(SIZE, cap!.h, ratio), width)
      return capsule(w, h, { stroke: gc, strokeWidth: width, opacity })
    }
    return { type: 'circle', r: mul(R, ratio), stroke: gc, strokeWidth: width, opacity }
  }

  /* 1. core flash */
  const flash: Slice = flavor.flash === 'tail'
    ? { type: 'circle', r: mul(UNIT, tokens.stroke.holdBody, grow), fill: gc, opacity: mul(0.25, lerp(1, 0, T('f3'))) }
    : solid(grow, mul(0.25, lerp(1, 0, T('f3'))))

  /* 2. shock ring: 1.6 → 0.35 widths, radius 0.95 → reach, fade 1 − quintic */
  const shock = outline(
    lerp(0.95, reach, T('sk')),
    mul(A('ringW'), lerp(1.6, 0.35, T('sk'))),
    mul(0.5, lerp(1, 0, T('oq'))),
  )

  /* 3. second ring (hold family) */
  const second: Slice | null = flavor.extra === 'double'
    ? outline(
        lerp(0.7, reach * 0.78, T('s1')),
        mul(A('ringW'), lerp(0.9, 0.2, T('s2'))),
        lerp(1, 0, T('s3')),
      )
    : null

  /* 4. crisp sector ring (perfect / great, never on capsules) */
  let sectors: Slice | null = null
  if (g.sector && flavor.shape !== 'capsule') {
    const duty = lerp(0.62, 0.12, T('secK'))
    const r = mul(R, lerp(reach * 0.8, reach * 1.02, T('secK')))
    if (flavor.sectors <= 4) {
      sectors = {
        type: 'group',
        opacity: lerp(1, 0, T('secF')),
        children: Array.from({ length: 4 }, (_, i) => {
          const c = i * (TAU / 4) + TAU / 8
          return {
            type: 'arc',
            r,
            start: add(c, mul(-0.672, duty)),
            end: add(c, mul(0.672, duty)),
            strokeWidth: mul(A('ringW'), 0.45),
            stroke: gc,
            cap: 'butt',
          } satisfies Slice
        }),
      }
    }
    else {
      sectors = {
        type: 'ring',
        r,
        width: mul(A('ringW'), lerp(0.55, 0.25, T('secK'))),
        segments: flavor.sectors,
        assemble: duty,
        spin: mul(0.35, T('secK')),
        stroke: gc,
        opacity: lerp(1, 0, T('secF')),
      }
    }
  }

  /* 5. shards — fixed per-item values expanded from mulberry32 at authoring time */
  const shardCount = g.shards + (flavor.extra === 'double' || flavor.extra === 'beam' ? 4 : 0)
  let shards: Slice | null = null
  if (g.shards > 0) {
    // (count still includes the +4 for double/beam, but the imperative gates on the grade's own shard count)
    const sectorsForShards = flavor.extra === 'streaks'
      ? [[TAU / 4 - 0.5, TAU / 4 + 0.5], [TAU * 0.75 - 0.5, TAU * 0.75 + 0.5]] as [number, number][]
      : undefined
    const params = shardParams(shardCount, flavor.seed * 31 + g.shards, sectorsForShards)
    const shardColor: ColorExpr = grade === 'perfect' ? '#FFFFFF' : gc
    shards = {
      type: 'group',
      children: params.map((p, i) => {
        // the shards clock is u rescaled by seg(u, 0.02, 1) — fold that into every window
        const w0 = 0.02 + 0.98 * p.delay
        const w1 = 0.02 + 0.98 * (p.delay + p.life)
        const px = Math.sin(p.a)
        const py = -Math.cos(p.a)
        const sx = keys([
          key(w0, 0.8 * px),
          key(w1, (0.8 + (1.12 * reach - 0.8) * p.reach) * px, 'outQuart'),
        ])
        const sy = keys([
          key(w0, 0.8 * py),
          key(w1, (0.8 + (1.12 * reach - 0.8) * p.reach) * py, 'outQuart'),
        ])
        const sr = keys([key(w0, p.a), key(w1, p.a + 2.2 * p.dir)])
        const ss = keys([
          key(w0, p.sizeMul),
          key(w0 + 0.35 * (w1 - w0), p.sizeMul),
          key(w1, 0, 'outCubic'),
        ])
        tracks[`sh${i}x`] = sx
        tracks[`sh${i}y`] = sy
        tracks[`sh${i}r`] = sr
        tracks[`sh${i}s`] = ss
        const s = mul(UNIT, 0.06, T(`sh${i}s`))
        return {
          type: 'group',
          gate: gate({ from: w0, until: w1 }),
          transform: { x: mul(R, T(`sh${i}x`)), y: mul(R, T(`sh${i}y`)), rotate: T(`sh${i}r`) },
          children: [{ type: 'rect', x: mul(s, -0.5), y: mul(s, -0.5), w: s, h: s, fill: shardColor }],
        } satisfies Slice
      }),
    }
  }

  /* 6. extras */
  let extra: Slice | null = null
  if (flavor.extra === 'streaks') {
    tracks.kS = keys([key(0, 0), key(0.7, 1, 'outQuart')])
    tracks.f4 = keys([key(0.35, 0), key(0.8, 1)])
    const len = mul(R, lerp(0.3, 1.2, T('kS')))
    const off = mul(R, lerp(0.9, 1.25, T('kS')))
    const th = mul(A('ringW'), lerp(0.8, 0.15, T('kS')))
    const streaks: Slice = {
      type: 'group',
      opacity: lerp(1, 0, T('f4')),
      children: [
        { type: 'rect', x: off, y: mul(th, -0.5), w: len, h: th, fill: gc },
        { type: 'rect', x: add(mul(off, -1), mul(len, -1)), y: mul(th, -0.5), w: len, h: th, fill: gc },
      ],
    }
    const arrows: Slice[] = []
    for (let i = 0; i < FLICK_ARROWS[grade]; i++) {
      const kaFrom = i * 0.08
      const kaTo = 0.7 + i * 0.08
      tracks[`ka${i}`] = keys([
        key(kaFrom, 0.2),
        key(kaTo, 1.5 - i * 0.42, 'outQuart'),
      ])
      tracks[`kaIn${i}`] = keys([key(kaFrom, 0), key(kaFrom + 0.105, 1)])
      tracks[`kaOut${i}`] = keys([key(kaFrom + 0.315, 0), key(kaTo, 1)])
      const tip = mul(R, T(`ka${i}`))
      const half = mul(R, 0.38)
      arrows.push({
        ...flickChevron(tip, half, mul(A('ringW'), 1.1), gc, mul(0.42, T(`kaIn${i}`), lerp(1, 0, T(`kaOut${i}`)), 1 - i * 0.18)),
        gate: gate({ from: kaFrom, until: kaTo }),
      })
    }
    extra = { type: 'group', children: [streaks, ...arrows] }
  }
  else if (flavor.extra === 'beam') {
    tracks.kB = keys([key(0, 0), key(0.6, 1, 'outCubic')])
    tracks.f5 = keys([key(0.25, 0), key(0.75, 1)])
    const w = mul(A('ringW'), lerp(1.4, 0.2, T('kB')))
    const h = mul(R, lerp(1, 3, T('kB')))
    extra = { type: 'rect', x: mul(w, -0.5), y: mul(h, -1), w, h: mul(h, 2), fill: gc, opacity: mul(0.85, lerp(1, 0, T('f5'))) }
  }

  /* flick arrows sit on top (they carry the swipe direction); the beam sits underneath */
  const ordered = flavor.extra === 'streaks'
    ? [shock, second, sectors, flash, shards, extra]
    : [extra, shock, second, sectors, flash, shards]

  return {
    mode: 'once',
    duration: CLEAR_TIME[grade],
    tracks,
    root: { opacity: 1 },
    layers: ordered.filter((s): s is Slice => s !== null),
  }
}

/** `effects.missEffect` — the note powers down to a dim ghost and sinks. */
function missClip(shape: EffectShape, cap?: { w: number, h: number }): SkinClip {
  const gray: ColorExpr = { game: 'miss' }
  const tracks: Record<string, Track> = {
    k: { ease: 'outCubic' },
    op: keys([key(0, 1), key(0.25, 1), key(1, 0)]),
  }
  const shrink = lerp(0.92, 0.75, T('k'))
  const sink = mul(UNIT, lerp(0, 0.08, T('k')))
  const widthFall = mul(A('ringW'), lerp(1, 0.6, T('k')))
  const solid: Slice = shape === 'capsule'
    ? capsule(mul(SIZE, cap!.w, shrink), mul(SIZE, cap!.h, shrink), { fill: { shade: 800 }, opacity: 0.9 })
    : { type: 'circle', r: mul(R, shrink), fill: { shade: 800 }, opacity: 0.9 }
  const outlineR = add(mul(R, lerp(1, 0.78, T('k'))), mul(A('ringW'), -0.5))
  // capsule outline: r = R·lerp − W/2 and size = 2R, so
  //   w = size·cap.w·(r/size·2)… folds to size·cap.w·lerp + cap.w·W
  const outline: Slice = shape === 'capsule'
    ? capsule(add(mul(SIZE, cap!.w, lerp(1, 0.78, T('k'))), mul(A('ringW'), -cap!.w), widthFall), add(mul(SIZE, cap!.h, lerp(1, 0.78, T('k'))), mul(A('ringW'), -cap!.h), widthFall), { stroke: gray, strokeWidth: widthFall, opacity: 1 })
    : { type: 'circle', r: outlineR, stroke: gray, strokeWidth: widthFall, opacity: 1 }
  return {
    mode: 'once',
    duration: CLEAR_TIME.miss,
    tracks,
    root: { opacity: T('op'), transform: { y: sink } },
    layers: [solid, outline],
  }
}

/** `effects.makeExitClip` — the enter animation rewound under the alpha curve. */
function exitClip(curve: { duration: number, drop: number, fall: number, power: number }): SkinClip {
  return {
    mode: 'once',
    duration: curve.duration,
    layers: [],
    rewind: { source: 'enter', speed: EXIT.rewind },
    alpha: { type: 'exit', drop: curve.drop, fall: curve.fall, power: curve.power },
  }
}

/* ------------------------------------------------------------------ */
/* enter transcriptions                                                */

/** `click.clickEnter` — ball + shade split + double blink + assembling ring + approach ring. */
function clickEnterClip(note: string): SkinClip {
  const tracks: Record<string, Track> = {
    fade: keys([key(0, 0), key(0.1, 1, 'outCubic')]),
    build: keys([key(0, 0), key(CLICK_TIMING.splitFrom, 1, 'outQuart')]),
    frameFrac: keys([key(0, 0.45), key(CLICK_TIMING.splitFrom, 1, 'outQuart')]),
    split: keys([key(CLICK_TIMING.splitFrom, 0), key(CLICK_TIMING.splitTo, 1, 'outQuad')]),
    size: riseSettle(tokens.sizeCurve.click),
    thick: keys([key(CLICK_TIMING.frameFrom, 1), key(1, 1.5, 'inQuad')]),
    coreG: keys([key(CLICK_TIMING.coreFrom, 0.36), key(CLICK_TIMING.coreFull, 1, 'inQuad')]),
    blink: bump([[CLICK_TIMING.readyBlinkFrom, CLICK_TIMING.blinkFrom], [CLICK_TIMING.blinkFrom, 1]]),
    ap: keys([key(CLICK_TIMING.approachFrom, 0), key(1, 1)]),
    apOp: keys([key(CLICK_TIMING.approachFrom, 0), key(0.745, 1)]),
  }
  const frameW = mul(W, T('frameFrac'), T('thick'))
  const coreR = mul(INNER_HALF, T('coreG'))
  const body: Slice = {
    type: 'group',
    transform: { scale: T('size') },
    children: [
      { type: 'circle', r: add(INNER, 0.5), fill: { shade: lerp(700, 800, T('split')) }, opacity: 1 },
      { type: 'circle', r: coreR, fill: { shade: lerp(700, 400, T('split')) }, opacity: T('split'), gate: gate({ track: 'split', from: 0 }) },
      { type: 'circle', r: coreR, fill: { ring: 1 }, opacity: mul(0.3, T('blink')), gate: gate({ track: 'blink', from: 0 }) },
      { type: 'ring', r: add(R, mul(-0.5, frameW)), width: frameW, stroke: { ring: T('split') }, segments: 3, assemble: T('build'), spin: lerp(-TAU / 6, 0, T('build')), edge: EDGE, opacity: 1 },
    ],
  }
  const approach: Slice = {
    type: 'circle',
    r: lerp(mul(R, 1.83), RING_C, T('ap')),
    stroke: { ring: 1 },
    strokeWidth: mul(HAIR, lerp(0.375, 0.525, T('ap'))),
    opacity: mul(0.5, T('apOp')),
    gate: gate({ from: CLICK_TIMING.approachFrom, until: 1 }),
  }
  return { mode: 'normalized', duration: tokens.time.enter, note, tracks, root: { opacity: T('fade') }, layers: [approach, body] }
}

/** `drag.headDraw` — full fill + chain arrow + neutral ring. */
function dragHeadClip(note: string): SkinClip {
  const tracks: Record<string, Track> = {
    fade: keys([key(0, 0), key(0.06, 1)]),
    k: keys([key(0, 0), key(0.2, 1, 'outCubic')]),
    arrowShow: keys([key(0.06, 0), key(0.2, 1, 'outCubic')]),
    wake: keys([key(WAKE.from, 0), key(WAKE.to, 1, 'inOutQuad')]),
    size: riseSettle(tokens.sizeCurve.dragHead),
  }
  // dragArrow passes inner·0.95 and arrowHead grows it ×1.05: s = size/2 = inner · 0.49875
  const s = 0.49875
  const arrow: Slice = {
    type: 'group',
    opacity: T('arrowShow'),
    transform: { rotate: HEADING, scale: lerp(0.6, 1, T('arrowShow')) },
    gate: gate({ track: 'arrowShow', from: 0 }),
    children: [{
      type: 'poly',
      points: [
        [n(0), mul(INNER, -s)],
        [mul(INNER, s * 0.82), mul(INNER, s * 0.78)],
        [n(0), mul(INNER, s * 0.3)],
        [mul(INNER, -s * 0.82), mul(INNER, s * 0.78)],
      ],
      closed: true,
      join: 'round',
      fill: { ring: T('wake') },
      opacity: 1,
    }],
  }
  return {
    mode: 'normalized',
    duration: tokens.time.enter,
    note,
    tracks,
    root: { opacity: T('fade'), transform: { scale: T('size') } },
    layers: [
      { type: 'circle', r: add(INNER, 0.5), fill: { shade: lerp(600, 400, T('wake')) }, opacity: 1 },
      arrow,
      { type: 'ring', r: RING_C, width: W, stroke: { ring: T('wake') }, segments: 2, assemble: T('k'), spin: lerp(-TAU / 4, 0, T('k')), edge: EDGE, opacity: 1 },
    ],
  }
}

/** `drag.childDraw` — solid bead + stepped silhouette edge + faint hairline. */
function dragChildClip(note: string): SkinClip {
  const tracks: Record<string, Track> = {
    fade: keys([key(0, 0), key(0.06, 1)]),
    k: keys([key(0, 0), key(0.2, 1, 'outCubic')]),
    wake: keys([key(WAKE.from, 0), key(WAKE.to, 1, 'inOutQuad')]),
    size: riseSettle(tokens.sizeCurve.dragChild),
  }
  return {
    mode: 'normalized',
    duration: tokens.time.enter,
    note,
    tracks,
    root: { opacity: T('fade'), transform: { scale: T('size') } },
    layers: [
      { type: 'circle', r: R, fill: { shade: lerp(600, 400, T('wake')) }, opacity: 1 },
      ...resolvedBands().map((b): Slice => ({
        type: 'circle',
        r: add(R, mul(W, b.off)),
        stroke: EDGE.color,
        strokeWidth: mul(W, b.frac),
        opacity: b.opacity,
      })),
      { type: 'circle', r: mul(R, 0.62), stroke: { shade: lerp(800, 600, T('wake')) }, strokeWidth: HAIR, opacity: mul(0.7, T('k')) },
    ],
  }
}

/** `hold.holdEnter` — ring + dark socket head + damped lock brackets. */
function holdEnterClip(long: boolean, note: string): SkinClip {
  const tracks: Record<string, Track> = {
    headFade: keys([key(0, 0), key(0.08, 1)]),
    k: keys([key(0, 0), key(0.35, 1, 'outCubic')]),
    kQ: keys([key(0, 0), key(0.35, 1, 'outQuart(outCubic)')]),
    widthFrac: keys([key(0, 0.5), key(0.35, 1, 'outCubic')]),
    glyph: keys([key(0.2, 0), key(0.42, 1)]),
    glyphOB: keys([key(0.2, 0), key(0.42, 1, 'outBack(2)')]),
    split: keys([key(0.08, 0), key(0.35, 1, 'inOutQuad')]),
    wake: keys([key(HOLD_WAKE.from, 0), key(HOLD_WAKE.to, 1, 'inOutSine')]),
    size: keys([key(0, tokens.sizeCurve.hold.spawn), key({ anchor: 'landP' }, 1, [tokens.sizeCurve.hold.ease[0], 0, tokens.sizeCurve.hold.ease[1], 1])]),
    spinE: damped({ from: 0.1, to: { anchor: 'landP' }, turns: 1.05, damping: 5, low: -TAU * 1.05, high: 0 }),
    bracketFade: keys([key(0.1, 0), key(0.25, 1)]),
  }
  const glyphInner: Slice = long
    ? { type: 'rect', x: mul(R, -0.164), y: mul(R, -0.164), w: mul(R, 0.328), h: mul(R, 0.328), stroke: { ring: T('wake') }, strokeWidth: A('glyphW'), join: 'miter', opacity: 1 }
    : { type: 'circle', r: mul(R, 0.2), stroke: { ring: T('wake') }, strokeWidth: A('glyphW'), opacity: 1 }
  const head: Slice = {
    type: 'group',
    children: [
      { type: 'circle', r: add(INNER, 0.5), fill: { shade: lerp(600, lerp(600, 400, T('wake')), T('split')) }, opacity: 1 },
      { type: 'circle', r: lerp(add(INNER, 0.5), A('coreR'), T('split')), fill: { shade: lerp(600, lerp(1100, 900, T('wake')), T('split')) }, opacity: 1 },
      {
        type: 'group',
        opacity: clamp(mul(2, T('glyph'))),
        transform: { scale: lerp(0.4, 1, T('glyphOB')) },
        gate: gate({ track: 'glyph', from: 0 }),
        children: [glyphInner],
      },
      { type: 'ring', r: RING_C, width: mul(W, T('widthFrac')), stroke: { ring: T('wake') }, segments: 2, assemble: T('kQ'), spin: lerp(-TAU / 4, 0, T('k')), edge: EDGE, opacity: 1 },
    ],
  }
  const halfSpan = TAU * 0.16
  const lock: Slice = {
    type: 'group',
    opacity: T('bracketFade'),
    gate: gate({ track: 'bracketFade', from: 0 }),
    children: [TAU / 4, TAU * 3 / 4].map(mid => ({
      type: 'arc',
      r: A('bracketR'),
      start: add(mid, T('spinE'), -halfSpan),
      end: add(mid, T('spinE'), halfSpan),
      strokeWidth: A('bracketW'),
      stroke: { ring: T('wake') },
      cap: 'butt',
    } satisfies Slice)),
  }
  return {
    mode: 'normalized',
    duration: tokens.time.enter,
    note,
    tracks,
    root: { opacity: T('headFade'), transform: { scale: T('size') } },
    layers: [lock, head],
  }
}

/** `hold.holdPress` — the head sinks and the brackets clamp onto the ring. */
function holdPressClip(long: boolean): SkinClip {
  // keys live on the normalized clock (φ = t / holdPress); the imperative writes them in seconds
  const tracks: Record<string, Track> = {
    k: keys([key(0, 0), key(1, 1, 'outCubic')]),
    lockOp: keys([key(0, 1), key(0.5, 1), key(1, 0)]),
  }
  const halfSpan = TAU * 0.16
  const glyphInner: Slice = long
    ? { type: 'rect', x: mul(R, -0.164), y: mul(R, -0.164), w: mul(R, 0.328), h: mul(R, 0.328), stroke: { ring: 1 }, strokeWidth: A('glyphW'), join: 'miter', opacity: 1 }
    : { type: 'circle', r: mul(R, 0.2), stroke: { ring: 1 }, strokeWidth: A('glyphW'), opacity: 1 }
  return {
    mode: 'once',
    duration: tokens.time.holdPress,
    tracks,
    root: { transform: { scale: lerp(1, 0.86, T('k')) } },
    layers: [
      {
        type: 'group',
        opacity: T('lockOp'),
        gate: gate({ track: 'lockOp', from: 0 }),
        children: [TAU / 4, TAU * 3 / 4].map(mid => ({
          type: 'arc',
          r: lerp(A('bracketR'), RING_C, T('k')),
          start: add(mid, -halfSpan),
          end: add(mid, halfSpan),
          strokeWidth: lerp(A('bracketW'), W, T('k')),
          stroke: { ring: 1 },
          cap: 'butt',
        } satisfies Slice)),
      },
      {
        type: 'group',
        children: [
          { type: 'circle', r: add(INNER, 0.5), fill: { shade: 400 }, opacity: 1 },
          { type: 'circle', r: A('coreR'), fill: { shade: 900 }, opacity: 1 },
          { type: 'group', opacity: 1, transform: { scale: 1 }, children: [glyphInner] },
          { type: 'ring', r: RING_C, width: W, stroke: { ring: 1 }, segments: 2, assemble: 1, spin: 0, edge: EDGE, opacity: 1 },
        ],
      },
    ],
  }
}

/**
 * `hold.loopUnder` — retained capture-calibrated band contract, NOT an exact
 * orthographic projection of the current Unity HoldFx. Full audit, formulas,
 * uncertainty and Unity references: packages/notes/hold-fx-sync.md.
 * Game paths below are relative to Assets/; R = unpressed design head radius.
 *
 * Skin constant | Unity source | Mapping status
 * 4 circles, offsets i/4 | StaticResources/Prefabs/Game/HoldFx.prefab:
 *   InitialModule.startLifetime=0.5, EmissionModule.rateOverTime=8 |
 *   8 × 0.5 = 4 live PARTICLES; replacing them with full bands is a design choice.
 * r keys 0→1.7 R | InitialModule.startSpeed=5, lifetime=0.5 |
 *   2.5 is nominal unscaled 3D travel, NOT projected radial travel;
 *   1.7 is a historical screenshot calibration, not code-derived.
 * strokeWidth R/3 | InitialModule.startSize=1; NoteFillMat/NoteFill.png |
 *   historical screenshot calibration; startSize is billboard extent, not radius.
 *   Local scaling and enabled SizeModule (1→0.5988693) prevent a fixed-width mapping.
 * alpha 0.39→0.196@1/3→0 | ColorModule.maxGradient |
 *   rounded from 0.39215687→0.19607843@21781/65535→0, linear;
 *   minMaxState=1 means Gradient, so minGradient is unused (not randomized).
 * stroke shade 400, no fill | Scripts/Game/Notes/Flat/FlatHoldNoteRenderer.cs:
 *   OnNoteLoaded.startColor=BaseFillColor, sortingOrder=SortingOrder-2 |
 *   palette translation and under-head placement, not identical material blending.
 * loop, duration tokens.time.holdLoop=0.6 | prefab lifetime=0.5;
 *   Scripts/Game/Notes/Flat/Palette/FlatTokens.cs:Time.HoldLoop=0.6 |
 *   deliberate ×1.2 time stretch; skin emission equivalent is 4/0.6, not 8/s.
 *
 * Semantic corrections: ShapeModule is DISABLED (stored Cone/type=4, radius=1,
 * angle=25 are inactive); default point emission travels along local +Z, not
 * radially in XY. Orthographic depth travel cannot create expanding rings.
 * scalingMode=1 is Local (Hierarchy=0); own transform scale affects particle
 * size/movement, parent scale is ignored. Both Flat and Classic set own scale
 * to 5 × (1 + ClearEffectsSize) × fxScale in UpdateTransformScale.
 * SizeModule is enabled; ClampVelocityModule is enabled with separate axes,
 * z limit 0 and dampen 0.75, so speed × lifetime is not even actual Z travel.
 *
 * Camera source is Scenes/Game.unity:12421 (ortho=5), wired at :2490.
 * GameConfig.cs:67-74 + FlatNoteRendererBase.cs:63,89-95 give default unpressed
 * head diameter ≈2.234555 world units, not 3; see the audit for settings/overrides.
 * No numeric skin/oracle changes here: tests freeze the calibrated design until
 * a separately reviewed visual revision replaces it with faithful particle discs.
 */
function holdPulseClip(_long: boolean): SkinClip {
  const tracks: Record<string, Track> = {}
  const layers: Slice[] = [0, 1, 2, 3].map((i) => {
    const p = i === 0 ? {} : { offset: i / 4 }
    tracks[`pulse${i}`] = keys([key(0, 0), key(1, 1.7)], p)
    tracks[`pulseO${i}`] = keys([key(0, 0.39), key(1 / 3, 0.196), key(1, 0)], p)
    return {
      type: 'circle',
      r: mul(R, T(`pulse${i}`)),
      stroke: { shade: 400 },
      strokeWidth: mul(R, 1 / 3),
      opacity: T(`pulseO${i}`),
    } satisfies Slice
  })
  return {
    mode: 'loop',
    duration: tokens.time.holdLoop,
    note: 'Capture-calibrated holdFx approximation: four shade-400 ring bands, quarter-period offsets, radius 0→1.7 R, width R/3, alpha 0.39 → 0.196@1/3 → 0. Seamless.',
    tracks,
    layers,
  }
}

/** `hold.holdProgress` — 800 track, 50 lead at 4/3·p, 500 fill at p. */
function holdProgressClip(): SkinClip {
  return {
    mode: 'progress',
    duration: 1,
    tracks: {
      lead: keys([key(0, 0), key(0.75, 1)]),
      done: keys([key(0, 0), key(1, 1)]),
    },
    layers: [
      { type: 'circle', r: A('progressR'), stroke: { shade: 800 }, strokeWidth: A('progressW'), opacity: 0.9 },
      { type: 'arc', r: A('progressR'), start: 0, end: mul(TAU, T('lead')), stroke: { shade: 50 }, strokeWidth: A('progressW'), cap: 'butt', gate: gate({ from: 0 }) },
      { type: 'arc', r: A('progressR'), start: 0, end: mul(TAU, T('done')), stroke: { shade: 500 }, strokeWidth: A('progressW'), cap: 'butt', gate: gate({ from: 0 }) },
    ],
  }
}

/**
 * `flick.flickEnter` — diamond + chevrons. The outline grows edge-by-edge
 * from the midpoints until the assembly closes at build 0.999, then reads as
 * one closed diamond (the imperative branch, kept verbatim).
 */
function flickEnterClip(note: string): SkinClip {
  const pts: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
  const tracks: Record<string, Track> = {
    fade: keys([key(0, 0), key(0.12, 1, 'outCubic')]),
    build: keys([key(0, 0), key(0.45, 1, 'outQuart')]),
    frameFrac: keys([key(0, 0.45), key(0.45, 1, 'outQuart')]),
    split: keys([key(CLICK_TIMING.splitFrom, 0), key(CLICK_TIMING.splitTo, 1, 'outQuad')]),
    size: riseSettle(tokens.sizeCurve.click),
    thick: keys([key(CLICK_TIMING.frameFrom, 1), key(1, 1.5, 'inQuad')]),
    coreG: keys([key(CLICK_TIMING.coreFrom, 0.36), key(CLICK_TIMING.coreFull, 1, 'inQuad')]),
    blink: bump([[CLICK_TIMING.readyBlinkFrom, CLICK_TIMING.blinkFrom], [CLICK_TIMING.blinkFrom, 1]]),
    ap: keys([key(CLICK_TIMING.approachFrom, 0), key(1, 1)]),
    apOp: keys([key(CLICK_TIMING.approachFrom, 0), key(0.745, 1)]),
    travel: keys([key(0.25, 0), key(0.5, 1.42, SIZE_S), key(0.875, 1, SIZE_S)]),
    arrowOp: keys([key(0.32, 0), key(0.45, 1, 'outCubic')]),
    slitOp: keys([key(CLICK_TIMING.splitFrom, 0), key(0.75, 1, 'outCubic')]),
  }
  // edge-growth coordinate tracks: each edge's endpoints lerp midpoint → vertex (fractions of the band radius)
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i]!
    const p2 = pts[(i + 1) % 4]!
    const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2] as const
    for (const [comp, name] of [[0, 'x1'], [1, 'y1'], [0, 'x2'], [1, 'y2']] as const) {
      const which = name.endsWith('1') ? p1 : p2
      tracks[`g${i}${name}`] = keys([key(0, mid[comp]), key(0.45, which[comp], 'outQuart')])
    }
  }

  const fw = mul(A('flickW'), T('frameFrac'), T('thick'))
  // the outline centreline shifts inward by (thick − 1)·W / 2cos45° as it thickens
  const fr = add(A('rv'), mul(A('flickW'), add(T('thick'), -1), -1 / (2 * C45)))
  const closedGate = gate({ track: 'build', from: 0.999, fromInclusive: true })

  /** one band of the building diamond: a closed diamond at build ≥ 0.999, four growing lines before */
  const diamondBand = (r: NumExpr, width: NumExpr, stroke: ColorExpr, opacity: NumExpr): Slice => ({
    type: 'switch',
    gate: closedGate,
    then: diamond(r, { stroke, strokeWidth: width, opacity }),
    else: {
      type: 'group',
      opacity,
      children: [0, 1, 2, 3].map(i => ({
        type: 'line',
        x1: mul(r, T(`g${i}x1`)),
        y1: mul(r, T(`g${i}y1`)),
        x2: mul(r, T(`g${i}x2`)),
        y2: mul(r, T(`g${i}y2`)),
        stroke,
        strokeWidth: width,
        cap: 'square',
      } satisfies Slice)),
    },
  })

  const outline: Slice = {
    type: 'group',
    children: [
      // white band
      diamondBand(fr, fw, { ring: T('split') }, 1),
      // stepped dark edge bands on the outer silhouette, riding the same growth
      ...resolvedBands().map((b): Slice => {
        const rr = add(fr, mul(fw, (0.5 + b.off) / C45))
        return diamondBand(rr, mul(fw, b.frac), EDGE.color, b.opacity)
      }),
    ],
  }

  const chevrons = (px: NumExpr, width: NumExpr, stroke: ColorExpr): Slice[] => [
    { type: 'group', transform: { x: px }, children: [flickChevron(A('arrowTip'), A('arrowHalf'), width, stroke, 1)] },
    { type: 'group', transform: { x: mul(px, -1), rotate: Math.PI }, children: [flickChevron(A('arrowTip'), A('arrowHalf'), width, stroke, 1)] },
  ]

  const body: Slice = {
    type: 'group',
    transform: { scale: T('size') },
    children: [
      diamond(add(A('flickInner'), mul(A('flickW'), 0.15)), { fill: { shade: lerp(700, 800, T('split')) } }),
      { ...diamond(mul(A('coreMax'), T('coreG')), { fill: { shade: lerp(700, 400, T('split')) }, opacity: T('split') }), gate: gate({ track: 'split', from: 0 }) },
      { ...diamond(mul(A('coreMax'), T('coreG')), { fill: { ring: 1 }, opacity: mul(0.3, T('blink')) }), gate: gate({ track: 'blink', from: 0 }) },
      { type: 'line', x1: 0, y1: mul(A('flickInner'), mul(-0.5, T('coreG'))), x2: 0, y2: mul(A('flickInner'), mul(0.5, T('coreG'))), stroke: { shade: 600 }, strokeWidth: mul(A('flickW'), 0.5), opacity: T('slitOp') },
      outline,
    ],
  }
  const arrows: Slice = {
    type: 'group',
    opacity: T('arrowOp'),
    children: chevrons(lerp(A('nearFar'), A('near'), T('travel')), mul(A('flickW'), 0.85), { ring: T('split') }),
  }
  const approach: Slice = {
    type: 'group',
    opacity: mul(0.5, T('apOp')),
    gate: gate({ from: CLICK_TIMING.approachFrom, until: 1 }),
    children: chevrons(lerp(A('approachNear'), A('near'), T('ap')), mul(A('flickW'), 0.6), { ring: 1 }),
  }
  return { mode: 'normalized', duration: tokens.time.enter, note, tracks, root: { opacity: T('fade') }, layers: [approach, arrows, body] }
}

/** `drop.dropStatic` — the classic capsule, a still image. */
function dropEnterClip(spec: { cap: { w: number, h: number }, fill: { w: number, h: number }, core?: { w: number, h: number } }, note: string): SkinClip {
  const w = mul(SIZE, spec.cap.w)
  const h = mul(SIZE, spec.cap.h)
  const layers: Slice[] = [
    capsule(w, h, { fill: { ring: 1 } }),
    capsule(mul(SIZE, spec.cap.w, spec.fill.w), mul(SIZE, spec.cap.h, spec.fill.h), { fill: { shade: 400 } }),
    ...resolvedBands().map((b): Slice => {
      const w2 = add(w, mul(W, 2 * b.off))
      const h2 = add(h, mul(W, 2 * b.off))
      return capsule(w2, h2, { stroke: EDGE.color, strokeWidth: mul(W, b.frac), opacity: b.opacity })
    }),
  ]
  if (spec.core)
    layers.push(capsule(mul(SIZE, spec.cap.w, spec.core.w), mul(SIZE, spec.cap.h, spec.core.h), { fill: '#FFFFFF' }))
  return { mode: 'static', duration: tokens.time.enter, note, layers }
}

/* ------------------------------------------------------------------ */
/* assembly                                                            */

const CLICK_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.45, sectors: 24, extra: 'double', seed: 1 }
const HOLD_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.5, sectors: 24, extra: 'double', flash: 'tail', seed: 3 }
const LONG_HOLD_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.6, sectors: 24, extra: 'beam', flash: 'tail', seed: 4 }
const FLICK_CLEAR: ClearFlavor = { shape: 'diamond', reach: 1.4, sectors: 4, extra: 'streaks', seed: 2 }
const DRAG_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.4, sectors: 24, seed: 5 }
const DRAG_CHILD_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.4, sectors: 24, seed: 6 }
const CLICK_DRAG_CHILD_CLEAR: ClearFlavor = { shape: 'circle', reach: 1.4, sectors: 24, seed: 7 }
const DROP_CLICK_CLEAR: ClearFlavor = { shape: 'capsule', capsule: { w: 1, h: 76.8 / 536 }, reach: 1.3, sectors: 24, seed: 8 }
const DROP_DRAG_CLEAR: ClearFlavor = { shape: 'capsule', capsule: { w: 1, h: 76.8 / 404 }, reach: 1.3, sectors: 24, seed: 9 }

const DROP_CLICK_SPEC = {
  cap: { w: 1, h: 76.8 / 536 },
  fill: { w: 360.8 / 536, h: 68.8 / 76.8 },
  core: { w: 144.8 / 536, h: 32.8 / 76.8 },
}
const DROP_DRAG_SPEC = {
  cap: { w: 1, h: 76.8 / 404 },
  fill: { w: 244.8 / 404, h: 60.8 / 76.8 },
}

function clearAll(flavor: ClearFlavor): Record<'perfect' | 'great' | 'good' | 'bad', SkinClip> {
  return {
    perfect: clearClip(flavor, 'perfect'),
    great: clearClip(flavor, 'great'),
    good: clearClip(flavor, 'good'),
    bad: clearClip(flavor, 'bad'),
  }
}

/**
 * Build the flat skin document. `edge` overrides the embedded edge falloff
 * (default: `tokens.stroke.edge`) — used by `scripts/overlap.ts` to compare
 * falloff variants. Deterministic; shard randomness is expanded inline.
 */
export function buildFlatSkin(edge?: typeof EDGE): Skin {
  if (edge)
    EDGE = edge
  return {
    schemaVersion: 1,
    id: 'flat',
    name: 'Flat',
    meta: {
      palette: {
        chroma: tokens.chroma,
        hue: Object.fromEntries(Object.entries(tokens.hue).map(([f, v]) => [f, { ...v }])),
        ring: tokens.ring,
        grade: { ...tokens.grade },
      },
      grades: { ...tokens.grade },
    },
    notes: {
      'click': {
        enter: clickEnterClip('Size follows the fitted S-curve: dim small spawn, one slow-fast-slow growth into the +6 % peak with the double blink, settled on the exact hit pose from p 0.976; approach ring converges linearly over the last 30 %; the ring thickens inward by half a stroke width while the core rises onto its final inner edge — core and frame coincide exactly at the hit. Ring wakes neutral 400 → 50 with the shade split.'),
        clear: clearAll(CLICK_CLEAR),
        exit: exitClip(EXIT.tap),
      },
      'click-drag-head': {
        enter: clickEnterClip('Experiment: identical to click, no arrow — the chain alone marks the drag start.'),
        clear: clearAll(CLICK_CLEAR),
        exit: exitClip(EXIT.tap),
      },
      'drag-head': {
        enter: dragHeadClip('Fitted S-curve: small spawn, smooth growth into the +5 % peak at p 0.77, settled from p 0.87. Ring closes from 2 halves by p 0.2, arrow along the chain (rotate by heading); ring + arrow wake neutral 400 → 50 over the WAKE window. Path matters, not timing.'),
        clear: clearAll(DRAG_CLEAR),
        exit: exitClip(EXIT.tap),
      },
      'drag-child': {
        enter: dragChildClip('Solid bead (Cytoid), faint 600 hairline ring, fitted S-curve.'),
        clear: clearAll(DRAG_CHILD_CLEAR),
        exit: exitClip(EXIT.dragChild),
      },
      'click-drag-child': {
        enter: dragChildClip('Same as drag child, click colours.'),
        clear: clearAll(CLICK_DRAG_CHILD_CLEAR),
        exit: exitClip(EXIT.dragChild),
      },
      'flick': {
        enter: flickEnterClip('Diamond outline grows from edge midpoints; dim pre-roll and late core with a double blink (as Click) on Click\'s fitted size curve; chevrons dash in late (fade 0.32–0.45) on a short 0.30u flight over 0.25–0.5, overshooting ~16 px past rest (deepest ~p 0.5) and relaxing back across the diamond\'s growth so the body–arrow gap only closes; locked from p 0.875; from p 0.7 the outline thickens inward by half a stroke width (Click\'s frame thickening) onto the core risen to its inner edge — the two coincide exactly at the hit. Outline and chevrons wake neutral 400 → 50 with the split.'),
        clear: clearAll(FLICK_CLEAR),
        exit: exitClip(EXIT.tap),
      },
      'hold': {
        enter: holdEnterClip(false, 'Reads apart from a click: one smooth size ease, no overshoot, two lock brackets spin in on a heavy, viscous damping, landing on their rest pose ≈ 4 frames before the hit; size eases in on one long tail and lands with them. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); circle glyph. Colours wake gently over p 0.3–0.85 (page cue).'),
        clear: clearAll(HOLD_CLEAR),
        exit: exitClip(EXIT.holdHead),
        miss: missClip('circle'),
        hold: {
          press: holdPressClip(false),
          loopUnder: holdPulseClip(false),
          progress: holdProgressClip(),
        },
      },
      'long-hold': {
        enter: holdEnterClip(true, 'Reads apart from a click: one smooth size ease, no overshoot, two lock brackets spin in on a heavy, viscous damping, landing on their rest pose ≈ 4 frames before the hit; size eases in on one long tail and lands with them. 600 ball splits: band rises to 400, a 900 socket opens (click\'s luminance inverted); square glyph. Colours wake gently over p 0.3–0.85 (page cue).'),
        clear: clearAll(LONG_HOLD_CLEAR),
        exit: exitClip(EXIT.holdHead),
        miss: missClip('circle'),
        hold: {
          press: holdPressClip(true),
          loopUnder: holdPulseClip(true),
          progress: holdProgressClip(),
        },
      },
      'drop-click': {
        enter: dropEnterClip(DROP_CLICK_SPEC, 'Static image: classic capsule — ring body, fill, white core. Only its position moves (fall).'),
        clear: clearAll(DROP_CLICK_CLEAR),
        miss: missClip('capsule', DROP_CLICK_SPEC.cap),
      },
      'drop-drag': {
        enter: dropEnterClip(DROP_DRAG_SPEC, 'Static image: shorter classic capsule, ring body + fill, no core.'),
        clear: clearAll(DROP_DRAG_CLEAR),
        miss: missClip('capsule', DROP_DRAG_SPEC.cap),
      },
    },
  }
}

// CLI: regenerate src/skin/flat.skin.json
if (import.meta.url === `file://${argv[1]}`) {
  const out = resolve(import.meta.dirname, '../src/skin/flat.skin.json')
  writeFileSync(out, `${JSON.stringify(buildFlatSkin())}\n`)
  console.log(`wrote ${out} (${(JSON.stringify(buildFlatSkin()).length / 1024).toFixed(0)} kB)`)
}
