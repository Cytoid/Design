import type { NoteSkin } from '../notes/types'
import { compileSkin } from './compile'

export { compileAnimation, compileSkin } from './compile'
export { resolveInputs } from './inputs'
export { INPUTS, parseSkin, skinSchema } from './schema'
export type {
  Skin,
  Animation as SkinAnimation,
  Color as SkinColor,
  ColorBinding as SkinColorBinding,
  Ease as SkinEase,
  Frame as SkinFrame,
  Gate as SkinGate,
  Input as SkinInput,
  Layer as SkinLayer,
  SkinMeta,
  Properties as SkinProperties,
  Slot as SkinSlot,
  Time as SkinTime,
  Track as SkinTrack,
  Value as SkinValue,
} from './schema'

/** Incomplete kinds may inherit an explicitly supplied fallback. */
export function loadSkin(json: unknown, fallback?: NoteSkin): NoteSkin {
  return compileSkin(json, fallback)
}
