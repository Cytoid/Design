import type { Timing } from '../notes/timing'
import type { ClipMode, FeedbackView } from '../notes/types'
import type { Grade, NoteKind } from '../tokens'
import { TIMED_GRADES, TIMINGS } from '../notes/timing'
import { GRADES, NOTE_KINDS, noteTiming } from '../tokens'

export interface SlotContract { kind?: NoteKind, grade?: Grade, path: string, id: string, mode: ClipMode, duration: number }
export const slotRegistry = new Map<string, SlotContract>()
for (const kind of NOTE_KINDS) {
  const add = (path: string, id: string, mode: ClipMode, duration: number) => slotRegistry.set(`${kind}:${path}`, { kind, path, id, mode, duration })
  add('enter', 'enter', kind.startsWith('drop-') ? 'loop' : 'normalized', noteTiming.enter)
  for (const grade of ['perfect', 'great', 'good', 'bad'] as const) add(`clear:${grade}`, `clear-${grade}`, 'once', noteTiming.clear[grade])
  add('miss', 'miss', 'once', noteTiming.clear.miss)
  if (!kind.startsWith('drop-')) {
    const curve = kind === 'hold' || kind === 'long-hold' ? noteTiming.exit.holdHead : kind.endsWith('child') ? noteTiming.exit.dragChild : noteTiming.exit.tap
    add('exit', 'exit', 'once', curve.duration)
  }
  if (kind === 'drag-head' || kind === 'click-drag-head') {
    add('active', 'active', 'loop', noteTiming.activeLoop)
    add('chainLink', 'chain-link', 'loop', noteTiming.chainLinkLoop)
  }
  if (kind === 'hold' || kind === 'long-hold') {
    add('body', 'hold-body', 'progress', 1)
    add('press', 'hold-press', 'once', noteTiming.holdPress)
    add('loopUnder', 'hold-loop-under', 'loop', noteTiming.holdLoop)
    add('loopOver', 'hold-loop-over', 'loop', noteTiming.holdLoop)
    add('progress', 'hold-progress', 'progress', 1)
  }
}

/** One feedback slot of one note kind. */
export interface FeedbackBinding {
  kind: NoteKind
  name: string
  view: FeedbackView
  grade: Grade
  /** absent for judgement-only slots */
  timing?: Timing
}

/** Feedback slots of a kind: judgement-only, FAST / SLOW only, or both. */
export function feedbackBindings(kind: NoteKind): FeedbackBinding[] {
  return [
    ...GRADES.map((grade): FeedbackBinding => ({ kind, name: `${kind}:feedback:judgement:${grade}`, view: 'judgement', grade })),
    ...(['timing', 'combined'] as const).flatMap(view => TIMED_GRADES.flatMap((grade): FeedbackBinding[] =>
      TIMINGS.map(timing => ({ kind, name: `${kind}:feedback:${view}:${grade}:${timing}`, view, grade, timing })))),
  ]
}

/** Every feedback slot of every kind, for skins and tooling that fill or inspect them all. */
export const allFeedbackBindings = NOTE_KINDS.flatMap(kind => feedbackBindings(kind))

for (const binding of allFeedbackBindings) {
  const timing = binding.timing ? `:${binding.timing}` : ''
  slotRegistry.set(binding.name, {
    kind: binding.kind,
    path: `feedback:${binding.view}`,
    id: `feedback:${binding.view}:${binding.grade}${timing}`,
    mode: 'once',
    duration: noteTiming.clear[binding.grade],
  })
}

/** How a clip's driver value maps to animation progress. `period` overrides a loop slot's contract duration; `<= 0` freezes on the first frame. */
export function slotProgress(slot: SlotContract, x: number, period = slot.duration): number {
  switch (slot.mode) {
    case 'normalized':
    case 'progress': return x
    case 'once': return x / slot.duration
    case 'loop': return period <= 0 ? 0 : (((x % period) + period) % period) / period
  }
}
