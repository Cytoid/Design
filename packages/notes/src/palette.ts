import type { Oklch } from './core/color'
import type { Direction, Family, Grade, NoteKind } from './tokens'
import { alpha, hexToOklch, oklch } from './core/color'
import { FAMILIES, FAMILY_OF, tokens } from './tokens'

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
export type Shade = typeof SHADES[number]

/** Step the input colour lands on — the note's true colour. */
export const BASE_SHADE = 400

/**
 * Fully resolved colours for one family + direction: a 50–950 scale
 * (`palette[400]` is the note colour) plus the ring and glyph ink.
 */
export interface NotePalette extends Record<Shade, string> {
  /** white ring by default */
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

export function derivePalette(input: ColorInput, opts: { saturation?: number, ring?: string } = {}): NotePalette {
  const sat = opts.saturation ?? 1
  let l: number, c: number, h: number
  if (typeof input === 'number') {
    h = ((input % 360) + 360) % 360
    l = fitLightness(h)
    c = tokens.chroma
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
    ring: opts.ring ?? tokens.ring,
    ink: oklch(0.24, Math.min(0.04, c * 0.3), h),
    hue: h,
  }
}

export function createPalette(options: PaletteOptions = {}): Palette {
  const cache = new Map<string, NotePalette>()
  const shift = options.hueShift ?? 0
  const family = (fam: Family, dir: Direction): NotePalette => {
    const key = `${fam}:${dir}`
    let p = cache.get(key)
    if (!p) {
      const override = options.families?.[fam]?.[dir]
      const input = override ?? tokens.hue[fam][dir] + shift
      p = derivePalette(typeof input === 'number' && override !== undefined ? input + shift : input, {
        saturation: options.saturation,
        ring: options.ring,
      })
      cache.set(key, p)
    }
    return p
  }
  return {
    family,
    note: (kind, dir) => family(FAMILY_OF[kind], dir),
    grade: { ...tokens.grade, ...options.grades },
    ring: options.ring ?? tokens.ring,
  }
}

export const defaultPalette = createPalette()

const parsed = new WeakMap<NotePalette, Map<Shade, Oklch>>()

function parsedShade(palette: NotePalette, step: Shade): Oklch {
  let cache = parsed.get(palette)
  if (!cache)
    parsed.set(palette, cache = new Map())
  let v = cache.get(step)
  if (!v)
    cache.set(step, v = hexToOklch(palette[step]))
  return v
}

/**
 * Sample the scale at any (fractional) step — piecewise-linear in OKLCH
 * between neighbouring shades, clamped to [50, 950]. Every in-note colour that
 * moves between shades goes through this, so all shade motion follows one
 * path. Exact steps return the scale colour verbatim.
 */
export function tone(palette: NotePalette, step: number): string {
  const s = Math.min(950, Math.max(50, step))
  let i = 0
  while (i < SHADES.length - 2 && s > SHADES[i + 1]!) i++
  const a = SHADES[i]!
  const b = SHADES[i + 1]!
  const k = (s - a) / (b - a)
  if (k <= 0)
    return palette[a]
  if (k >= 1)
    return palette[b]
  const pa = parsedShade(palette, a)
  const pb = parsedShade(palette, b)
  const dh = ((pb.h - pa.h + 540) % 360) - 180
  return oklch(pa.l + (pb.l - pa.l) * k, pa.c + (pb.c - pa.c) * k, pa.h + dh * k)
}

/** Lightness of neutral 400 (oklch 0.708 0 0) — the ring's spawn tone. */
const RING_SPAWN_L = 0.708

const ringTargetCache = new WeakMap<NotePalette, Oklch>()

function ringTarget(palette: NotePalette): Oklch {
  let v = ringTargetCache.get(palette)
  if (!v)
    ringTargetCache.set(palette, v = hexToOklch(palette.ring))
  return v
}

/**
 * Ring tone at wake progress `k` (0 = spawn, 1 = the resting ring colour).
 * The border is an achromatic neutral ramp — it spawns at neutral 400 and
 * rises to `palette.ring` (neutral 50 by default) on the same envelope that
 * wakes the fills, so the entry pose never pairs a pure-white border with a
 * dimmed body (the neutral 400 spawn sits at L 0.708, between body 700 and
 * the resting ring).
 */
export function ringTone(palette: NotePalette, k: number): string {
  const b = ringTarget(palette)
  const t = Math.min(1, Math.max(0, k))
  return oklch(RING_SPAWN_L + (b.l - RING_SPAWN_L) * t, b.c * t, b.h)
}

/** Snapshot every family into plain hex — handy for exporting to Cytoid settings JSON. */
export function exportPalette(p: Palette) {
  const out: Record<string, Record<Direction, NotePalette>> = {}
  for (const f of FAMILIES)
    out[f] = { up: p.family(f, 'up'), down: p.family(f, 'down') }
  return { families: out, grade: p.grade, ring: p.ring }
}

export { alpha }
