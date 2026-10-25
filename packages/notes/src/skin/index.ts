import type { NoteSkin } from '../notes/types'
import { compileSkin } from './compile'
import flatSkinJson from './flat.skin.json'
import { parseSkin } from './schema'

export { compileAnimation, compileSkin } from './compile'
export { resolveInputs } from './inputs'
export { INPUTS, parseSkin, skinSchema } from './schema'
export type {
  Skin,
  Animation as SkinAnimation,
  Color as SkinColor,
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

/** The shipped frame → animation → slot document. */
export const flatSkin = parseSkin(flatSkinJson)

export function loadFlatSkin(): NoteSkin {
  return compileSkin(flatSkin)
}

/** Incomplete kinds inherit an entire fallback design. Invalid documents throw. */
export function loadSkin(json: unknown, fallback: NoteSkin = loadFlatSkin()): NoteSkin {
  return compileSkin(json, fallback)
}
