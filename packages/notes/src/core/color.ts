/**
 * Colour math in OKLCH — perceptually uniform, so a user-picked hue keeps
 * the same visual weight as the defaults (no "neon yellow vs muddy blue").
 */

export interface Oklch { l: number, c: number, h: number }
export interface Rgb { r: number, g: number, b: number }

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

export function rgbToOklch({ r, g, b }: Rgb): Oklch {
  const lr = toLinear(r)
  const lg = toLinear(g)
  const lb = toLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const c = Math.hypot(A, B)
  let h = (Math.atan2(B, A) * 180) / Math.PI
  if (h < 0)
    h += 360
  return { l: L, c, h }
}

function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const hr = (h * Math.PI) / 180
  const A = c * Math.cos(hr)
  const B = c * Math.sin(hr)
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ]
}

const inGamut = (v: [number, number, number]) => v.every(x => x >= -1e-4 && x <= 1 + 1e-4)

/** OKLCH → sRGB with chroma reduction gamut mapping (keeps L and h). */
export function oklchToRgb(color: Oklch): Rgb {
  let lin = oklchToLinear(color)
  if (!inGamut(lin)) {
    let lo = 0
    let hi = color.c
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklchToLinear({ ...color, c: mid })))
        lo = mid
      else hi = mid
    }
    lin = oklchToLinear({ ...color, c: lo })
  }
  const [r, g, b] = lin.map(v => Math.min(1, Math.max(0, toGamma(Math.min(1, Math.max(0, v))))))
  return { r: r!, g: g!, b: b! }
}

export function parseHex(hex: string): Rgb {
  let h = hex.replace('#', '').trim()
  if (h.length === 3 || h.length === 4)
    h = h.split('').map(c => c + c).join('')
  const n = Number.parseInt(h.slice(0, 6), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

export function toHex({ r, g, b }: Rgb): string {
  const f = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${f(r)}${f(g)}${f(b)}`
}

export const oklch = (l: number, c: number, h: number) => toHex(oklchToRgb({ l, c, h }))
export const hexToOklch = (hex: string) => rgbToOklch(parseHex(hex))

/** `#rrggbb` + alpha → `rgba()` string usable by SVG, Canvas and CSS. */
export function alpha(hex: string, a: number): string {
  if (a >= 1)
    return hex
  const { r, g, b } = parseHex(hex)
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${+a.toFixed(4)})`
}

/** Linear sRGB-space mix (cheap; used for flashes / fades). */
export function mix(a: string, b: string, t: number): string {
  const x = parseHex(a)
  const y = parseHex(b)
  return toHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t })
}
