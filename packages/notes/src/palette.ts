import type { Direction, Family, Grade, NoteKind } from './tokens'
import { alpha, hexToOklch, mix, oklch } from './core/color'
import { FAMILIES } from './tokens'

/**
 * A colour input is either an OKLCH hue in degrees (recommended — the
 * design keeps its lightness/chroma balance) or a raw `#rrggbb` (Cytoid
 * custom colour compatibility; its own lightness & chroma are respected).
 */
export type ColorInput = number | string

export interface PaletteOptions {
  /** rotate every family hue by this many degrees */
  hueShift?: number
  /** per family / direction overrides */
  families?: Partial<Record<Family, Partial<Record<Direction, ColorInput>>>>
  /** global chroma multiplier (0 = monochrome) */
  saturation?: number
  /** ring colour (Cytoid `note_ring_colors`) */
  ring?: string
  grades?: Partial<Record<Grade, string>>
}

/** Tailwind-style shade steps. 400 is the family's true colour (the note fill). */
export const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type ShadeLevel = typeof SHADES[number]
export type Shade = ShadeLevel

/** Step the input colour lands on — the note's true colour. */
export const BASE_SHADE = 400

/**
 * Fully resolved colours for one family + direction: a 50–950 scale
 * (`palette[400]` is the note colour) plus the ring and glyph ink.
 */
export interface NotePalette extends Record<Shade, string> {
  /** resting ring colour — the ring band's 50 step, or the custom override */
  ring: string
  /** dark glyph colour on top of fills */
  ink: string
  /** hue that produced this palette (for effects) */
  hue: number
}

export interface Palette {
  note: (kind: NoteKind, direction: Direction) => NotePalette
  family: (family: Family, direction: Direction) => NotePalette
  grade: Record<Grade, string>
  ring: string
}

/**
 * Lightness tuned by hue: yellows/greens need more L to read as the same
 * "weight" as blues/reds against a dark stage.
 */
export function fitLightness(h: number): number {
  const d = Math.abs(((h - 100 + 540) % 360) - 180)
  return 0.705 + 0.13 * Math.exp(-((d / 48) ** 2))
}

/** Lightest L the 50 step approaches. */
const L_TOP = 0.985

/**
 * Shape of the scale around the base (400): lighter steps move a fraction of
 * the way from the base L toward L_TOP, darker steps scale the base L down;
 * chroma is a multiple of the base chroma. Calibrated so the defaults sit on
 * Tailwind's OKLCH lightness curve (400 ≈ 0.705) and the former roles map onto
 * steps: deep → 600, track → 800, light → 300.
 */
const SCALE: Record<Shade, { l: number, c: number }> = {
  50: { l: 0.96, c: 0.12 },
  100: { l: 0.86, c: 0.25 },
  200: { l: 0.69, c: 0.45 },
  300: { l: 0.43, c: 0.6 },
  400: { l: 0, c: 1 },
  500: { l: 0.88, c: 0.97 },
  600: { l: 0.76, c: 0.9 },
  700: { l: 0.66, c: 0.75 },
  800: { l: 0.55, c: 0.55 },
  900: { l: 0.47, c: 0.45 },
  950: { l: 0.36, c: 0.35 },
}

function shadeL(base: number, step: Shade): number {
  const k = SCALE[step].l
  if (step === BASE_SHADE)
    return base
  return step < BASE_SHADE ? base + (Math.max(base, L_TOP) - base) * k : base * k
}

/**
 * The ring band: the neutral counterpart of the family scale — the same
 * steps and the same shape, zero chroma — the way a UI kit pairs neutral
 * with primary. The ring wakes and rests on this band (400 → 50 by
 * default); only a custom resting colour re-anchors its 50 step.
 */
const NEUTRAL_BASE_L = 0.708 // oklch 0.708 0 0 — Tailwind's neutral 400
const NEUTRAL = (() => {
  const scale = {} as Record<Shade, string>
  for (const step of SHADES)
    scale[step] = oklch(shadeL(NEUTRAL_BASE_L, step), 0, 0)
  return scale
})()

export function derivePalette(input: ColorInput, opts: { chroma: number, saturation?: number, ring?: string }): NotePalette {
  const sat = opts.saturation ?? 1
  let l: number, c: number, h: number
  if (typeof input === 'number') {
    h = ((input % 360) + 360) % 360
    l = fitLightness(h)
    c = opts.chroma
  }
  else {
    ({ l, c, h } = hexToOklch(input))
  }
  c *= sat
  const scale = {} as Record<Shade, string>
  for (const step of SHADES)
    scale[step] = step === BASE_SHADE ? oklch(l, c, h) : oklch(shadeL(l, step), c * SCALE[step].c, h)
  return {
    ...scale,
    ring: opts.ring ?? NEUTRAL[50],
    ink: oklch(0.24, Math.min(0.04, c * 0.3), h),
    hue: h,
  }
}

/**
 * Sample any shade scale at a (fractional) step — piecewise-linear in OKLab
 * between neighbouring shades, clamped to [50, 950]. Exact steps return the
 * scale colour verbatim.
 */
function sampleScale(scale: Record<Shade, string>, step: number): string {
  const s = Math.min(950, Math.max(50, step))
  let i = 0
  while (i < SHADES.length - 2 && s > SHADES[i + 1]!) i++
  const a = SHADES[i]!
  const b = SHADES[i + 1]!
  const k = (s - a) / (b - a)
  if (k <= 0)
    return scale[a]
  if (k >= 1)
    return scale[b]
  return mix(scale[a], scale[b], k)
}

/**
 * Sample the note family's scale at any (fractional) step. Every in-note
 * fill colour that moves between shades goes through this, so all shade
 * motion follows one path.
 */
export function tone(palette: NotePalette, step: number): string {
  return sampleScale(palette, step)
}

/**
 * Ring tone at ring-band step `step` (fractional fine) — the ring band is
 * sampled exactly like the family scale (`tone`). Wake envelopes map
 * 400 → 50; entrances may start darker (steps above 400). A custom resting
 * colour (`palette.ring`, Cytoid `note_ring_colors`) re-anchors the ring
 * band's 50 only — the family scale is untouched.
 */
export function ringTone(palette: NotePalette, step: number): string {
  if (step >= 100 || palette.ring === NEUTRAL[50])
    return sampleScale(NEUTRAL, step)
  // custom resting colour: the last leg (100 → 50) blends toward it
  return mix(NEUTRAL[100], palette.ring, Math.min(1, Math.max(0, (100 - step) / 50)))
}

/** Snapshot every family into plain hex — handy for exporting to Cytoid settings JSON. */
export function exportPalette(p: Palette) {
  const out: Record<string, Record<Direction, NotePalette>> = {}
  for (const f of FAMILIES)
    out[f] = { up: p.family(f, 'up'), down: p.family(f, 'down') }
  return { families: out, grade: p.grade, ring: p.ring }
}

export const DEFAULT_RING_COLOR = NEUTRAL[50]

export { alpha }

/** Grade ramps retain the exact supplied base color at 400. */
const gradeScales = new WeakMap<Record<Grade, string>, Map<Grade, NotePalette>>()
export function gradePalette(grades: Record<Grade, string>, grade: Grade): NotePalette {
  let cache = gradeScales.get(grades)
  if (!cache)
    gradeScales.set(grades, cache = new Map())
  let scale = cache.get(grade)
  if (!scale || scale[400] !== grades[grade]) {
    scale = derivePalette(grades[grade], { chroma: 0 })
    scale[400] = grades[grade]
    cache.set(grade, scale)
  }
  return scale
}
