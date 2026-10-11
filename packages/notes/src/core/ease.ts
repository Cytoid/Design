/* Easing & timeline helpers. All functions are pure and engine-portable. */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const clamp01 = (v: number) => clamp(v, 0, 1)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** Remap `t` from [a, b] to [0, 1] (clamped). The basic keyframe building block. */
export function seg(t: number, a: number, b: number): number {
  if (b <= a)
    return t >= b ? 1 : 0
  return clamp01((t - a) / (b - a))
}

/** 0 → 1 → 0 bump over [a, b] (sin shaped). */
export function bump(t: number, a: number, b: number): number {
  const x = seg(t, a, b)
  return x <= 0 || x >= 1 ? 0 : Math.sin(x * Math.PI)
}

export type Ease = (t: number) => number

export const linear: Ease = t => t
export const inQuad: Ease = t => t * t
export const outQuad: Ease = t => 1 - (1 - t) * (1 - t)
export const outSine: Ease = t => Math.sin((t * Math.PI) / 2)
export const inOutQuad: Ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const inCubic: Ease = t => t * t * t
export const outCubic: Ease = t => 1 - (1 - t) ** 3
export const inOutCubic: Ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const outQuart: Ease = t => 1 - (1 - t) ** 4
export const outExpo: Ease = t => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
export const inExpo: Ease = t => (t <= 0 ? 0 : 2 ** (10 * t - 10))
export function outBack(t: number, s = 1.70158): number {
  const c3 = s + 1
  return 1 + c3 * (t - 1) ** 3 + s * (t - 1) ** 2
}

/** Ease applied on a sub-range: `ease(seg(t, a, b))`. */
export const ranged = (t: number, a: number, b: number, ease: Ease = linear) => ease(seg(t, a, b))

/**
 * Cubic-bezier easing (CSS semantics). With `y1 = 0, y2 = 1` this is a
 * skewable smoothstep — slow, fast, slow, with zero velocities at both ends.
 * The x solve is bisection: robust and engine-portable.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const px = (u: number) => ((ax * u + bx) * u + cx) * u
  const py = (u: number) => ((ay * u + by) * u + cy) * u
  return (t) => {
    if (t <= 0)
      return y1
    if (t >= 1)
      return y2
    let lo = 0
    let hi = 1
    let u = t
    for (let i = 0; i < 24; i++) {
      u = (lo + hi) / 2
      if (px(u) < t)
        lo = u
      else
        hi = u
    }
    return py(u)
  }
}

/** Anchor numbers of a fitted enter-size flow (see {@link riseSettleCurve}). */
export interface RiseSettle {
  /** size at p = 0 (first visible frame, relative to the hit pose) */
  spawn: number
  /** overshoot peak size */
  peak: number
  /** p of the peak (synced with the lead-in blink) */
  peakP: number
  /** p at which the size is exactly 1 again (the hit pose) */
  settleP: number
}

/**
 * The fitted enter-size flow as one clean motion: a single S-curve carries the
 * body from `spawn` up to the overshoot `peak` (at `peakP`), a second S
 * settles it back to exactly 1 — the hit pose — by `settleP`. Both phases
 * share the `s` cubic-bezier shape (`[x1, x2]`, y 0→1), so every junction has
 * zero velocity and each phase's velocity has a single hump — no wobble.
 */
export function riseSettleCurve(
  curve: RiseSettle,
  s: readonly [number, number],
): (p: number) => number {
  const shape = cubicBezier(s[0], 0, s[1], 1)
  return (p) => {
    if (p < curve.peakP)
      return lerp(curve.spawn, curve.peak, shape(seg(p, 0, curve.peakP)))
    if (p < curve.settleP)
      return lerp(curve.peak, 1, shape(seg(p, curve.peakP, curve.settleP)))
    return 1
  }
}

/** Deterministic PRNG (mulberry32) — effects must render identically in every frame bake. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const TAU = Math.PI * 2
