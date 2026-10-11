import type { PaletteOptions } from '@cytoid/notes'
import { createPalette, FAMILIES, GRADES } from '@cytoid/notes'
import { computed, ref, watch } from 'vue'

const key = 'cytoid-note-lab-palette-v1'
const hex = /^#[\da-f]{6}$/i
export function validatePalette(value: unknown): PaletteOptions {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a PaletteOptions JSON object.')
  const v = value as Record<string, unknown>
  const result: PaletteOptions = {}
  for (const name of ['hueShift', 'saturation'] as const) {
    if (v[name] !== undefined) {
      if (typeof v[name] !== 'number' || !Number.isFinite(v[name]) || (name === 'saturation' && (v[name] < 0 || v[name] > 2)))
        throw new Error(`Invalid ${name}.`)
      result[name] = v[name]
    }
  }
  if (v.ring !== undefined) {
    if (typeof v.ring !== 'string' || !hex.test(v.ring))
      throw new Error('Ring must be #rrggbb.')
    result.ring = v.ring
  }
  if (v.families !== undefined) {
    if (!v.families || typeof v.families !== 'object' || Array.isArray(v.families))
      throw new Error('Invalid families.')
    result.families = {}
    for (const [family, directions] of Object.entries(v.families)) {
      if (!FAMILIES.includes(family as typeof FAMILIES[number]) || !directions || typeof directions !== 'object' || Array.isArray(directions))
        throw new Error(`Invalid family: ${family}`)
      const pair: Partial<Record<'up' | 'down', number | string>> = {}
      for (const [dir, color] of Object.entries(directions)) {
        if (dir !== 'up' && dir !== 'down')
          throw new Error('Direction must be up or down.')
        if (!(typeof color === 'number' && Number.isFinite(color)) && !(typeof color === 'string' && hex.test(color)))
          throw new Error(`Invalid colour for ${family}/${dir}.`)
        pair[dir] = color
      }
      result.families[family as typeof FAMILIES[number]] = pair
    }
  }
  if (v.grades !== undefined) {
    if (!v.grades || typeof v.grades !== 'object' || Array.isArray(v.grades))
      throw new Error('Invalid grades.')
    result.grades = {}
    for (const [grade, color] of Object.entries(v.grades)) {
      if (!GRADES.includes(grade as typeof GRADES[number]) || typeof color !== 'string' || !hex.test(color))
        throw new Error(`Invalid grade: ${grade}`)
      result.grades[grade as typeof GRADES[number]] = color
    }
  }
  return result
}
function restore(): PaletteOptions {
  try {
    if (import.meta.server)
      return {}
    return validatePalette(JSON.parse(localStorage.getItem(key) || '{}'))
  }
  catch { return {} }
}
export const paletteOptions = ref<PaletteOptions>(restore())
// Read every nested option inside the computed so colour caches rebuild on slider edits.
export const palette = computed(() => createPalette(JSON.parse(JSON.stringify(paletteOptions.value))))
export const storageError = ref('')
if (import.meta.client) {
  watch(paletteOptions, (value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      storageError.value = ''
    }
    catch { storageError.value = 'Browser storage unavailable; palette changes last for this session.' }
  }, { deep: true })
}
