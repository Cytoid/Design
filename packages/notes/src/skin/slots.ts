import type { ClipMode } from '../notes/types'
import type { NoteKind } from '../tokens'
import { NOTE_KINDS, tokens } from '../tokens'

export interface SlotContract { kind: NoteKind, path: string, id: string, mode: ClipMode, duration: number }
export const slotRegistry = new Map<string, SlotContract>()
for (const kind of NOTE_KINDS) {
  const add = (path: string, id: string, mode: ClipMode, duration: number) => slotRegistry.set(`${kind}:${path}`, { kind, path, id, mode, duration })
  add('enter', 'enter', kind.startsWith('drop-') ? 'static' : 'normalized', tokens.time.enter)
  for (const grade of ['perfect', 'great', 'good', 'bad'] as const) add(`clear:${grade}`, `clear-${grade}`, 'once', tokens.time.clear[grade])
  add('miss', 'miss', 'once', tokens.time.clear.miss)
  if (!kind.startsWith('drop-')) {
    const curve = kind === 'hold' || kind === 'long-hold' ? tokens.time.exit.holdHead : kind.endsWith('child') ? tokens.time.exit.dragChild : tokens.time.exit.tap
    add('exit', 'exit', 'once', curve.duration)
  }
  if (kind === 'hold' || kind === 'long-hold') {
    add('press', 'hold-press', 'once', tokens.time.holdPress)
    add('loopUnder', 'hold-loop-under', 'loop', tokens.time.holdLoop)
    add('loopOver', 'hold-loop-over', 'loop', tokens.time.holdLoop)
    add('progress', 'hold-progress', 'progress', 1)
  }
}
export function slotProgress(slot: SlotContract, x: number): number {
  switch (slot.mode) {
    case 'normalized':
    case 'progress': return x
    case 'once': return x / slot.duration
    case 'loop': return (((x % slot.duration) + slot.duration) % slot.duration) / slot.duration
    case 'static': return 0
  }
}
