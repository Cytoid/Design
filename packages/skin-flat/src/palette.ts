import type { Direction, Family, NotePalette, Palette, PaletteOptions } from '@cytoid/notes'
import { DEFAULT_RING_COLOR, derivePalette, FAMILY_OF } from '@cytoid/notes'
import { tokens } from './tokens'

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
        chroma: tokens.chroma,
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
    ring: options.ring ?? DEFAULT_RING_COLOR,
  }
}

export const defaultPalette = createPalette()
