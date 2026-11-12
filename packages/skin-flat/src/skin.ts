import type { NoteSkin } from '@cytoid/notes'
import { compileSkin, parseSkin } from '@cytoid/notes'
import document from './flat.skin.json'

export const flatSkin = parseSkin(document)
export const loadFlatSkin = (): NoteSkin => compileSkin(flatSkin)
