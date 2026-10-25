import type { ClipMode, FeedbackView } from '../notes/types'
import type { Grade, NoteKind } from '../tokens'
import { TIMED_GRADES, TIMINGS } from '../notes/timing'
import { GRADES, NOTE_KINDS, noteTiming } from '../tokens'

export interface SlotContract { kind?: NoteKind, grade?: Grade, path: string, id: string, mode: ClipMode, duration: number }
export const slotRegistry = new Map<string, SlotContract>()
for (const kind of NOTE_KINDS) {
  const add = (path: string, id: string, mode: ClipMode, duration: number) => slotRegistry.set(`${kind}:${path}`, { kind, path, id, mode, duration })
  add('enter', 'enter', kind.startsWith('drop-') ? 'static' : 'normalized', noteTiming.enter)
  for (const grade of ['perfect', 'great', 'good', 'bad'] as const) add(`clear:${grade}`, `clear-${grade}`, 'once', noteTiming.clear[grade])
  add('miss', 'miss', 'once', noteTiming.clear.miss)
  if (!kind.startsWith('drop-')) {
    const curve = kind === 'hold' || kind === 'long-hold' ? noteTiming.exit.holdHead : kind.endsWith('child') ? noteTiming.exit.dragChild : noteTiming.exit.tap
    add('exit', 'exit', 'once', curve.duration)
  }
  if (kind === 'hold' || kind === 'long-hold') {
    add('body', 'hold-body', 'progress', 1)
    add('press', 'hold-press', 'once', noteTiming.holdPress)
    add('loopUnder', 'hold-loop-under', 'loop', noteTiming.holdLoop)
    add('loopOver', 'hold-loop-over', 'loop', noteTiming.holdLoop)
    add('progress', 'hold-progress', 'progress', 1)
  }
}
export const feedbackBindings = [
  ...GRADES.map(grade => ({ name: `feedback:judgement:${grade}`, view: 'judgement' as const, grade, timing: undefined })),
  ...(['timing', 'combined'] as const).flatMap(view => TIMED_GRADES.flatMap(grade => TIMINGS.map(timing => ({ name: `feedback:${view}:${grade}:${timing}`, view, grade, timing })))),
]
for (const binding of feedbackBindings) {
  slotRegistry.set(binding.name, { grade: binding.grade, path: binding.view satisfies FeedbackView, id: binding.name, mode: 'once', duration: noteTiming.clear[binding.grade] })
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
