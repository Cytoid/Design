/**
 * The legacy imperative designs — the golden oracle.
 *
 * This is the pre-skin draw code, kept verbatim (imports repointed into src
 * after the truth-source switch). `test/skin.test.ts` pins the compiled skin's
 * SceneNode trees to these, byte for byte; the C# interpreter inherits the
 * same contract.
 */
import type { NoteDesign } from '../../../src/notes/types'
import type { NoteKind } from '../../../src/tokens'
import { click, clickDragHead } from './click'
import { clickDragChild, dragChild, dragHead } from './drag'
import { dropClick, dropDrag } from './drop'
import { flick } from './flick'
import { hold, longHold } from './hold'

export const designs: Record<NoteKind, NoteDesign> = {
  'click': click,
  'hold': hold,
  'long-hold': longHold,
  'drag-head': dragHead,
  'drag-child': dragChild,
  'flick': flick,
  'click-drag-head': clickDragHead,
  'click-drag-child': clickDragChild,
  'drop-click': dropClick,
  'drop-drag': dropDrag,
}
