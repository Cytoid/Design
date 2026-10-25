/** Independent imperative drawing reference used only for visual regression tests. */
import type { NoteDesign, NoteKind } from '@cytoid/notes'

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
