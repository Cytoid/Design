import type { NoteSkin } from '../notes/types'
import { compileSkin } from './compile'

export { compileAnimation, compileSkin } from './compile'
export type { AnimationClock } from './compile'
export { resolveInputs } from './inputs'
export { LoadedSkin, loadSkinResources, SkinImage } from './resources'
export type { SkinResourceOptions } from './resources'

/** Incomplete kinds may inherit an explicitly supplied fallback. */
export function loadSkin(json: unknown, fallback?: NoteSkin): NoteSkin {
  return compileSkin(json, fallback)
}

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
  LayersAnimation as SkinLayersAnimation,
  SkinMeta,
  Properties as SkinProperties,
  SequenceAnimation as SkinSequenceAnimation,
  Slot as SkinSlot,
  Time as SkinTime,
  Track as SkinTrack,
  Value as SkinValue,
} from './schema'
