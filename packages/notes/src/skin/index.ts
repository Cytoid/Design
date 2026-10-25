import type { NoteDesign } from '../notes/types'
import type { NoteKind } from '../tokens'
import flatSkinJson from './flat.skin.json'
import { compileSkin } from './interpret'
import { parseSkin } from './schema'

export * from './anchors'
export * from './interpret'
/**
 * Skin module — the data-driven note design format (v1) and its TS reference
 * interpreter. The C# side ports `interpret.ts` + `anchors.ts` and validates
 * against this same JSON via the golden tests.
 */
export * from './schema'

/** The shipped skin document, validated at import time. */
export const flatSkin = parseSkin(flatSkinJson)

/** The shipped flat skin, compiled to drop-in designs. */
export function loadFlatSkin(): Record<NoteKind, NoteDesign> {
  return compileSkin(flatSkin)
}
