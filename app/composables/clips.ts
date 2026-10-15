import type { Clip, Grade, NoteKind, NoteState, Timing } from '@cytoid/notes'
import { designs, tokens } from '@cytoid/notes'

export function clipMax(clip: Pick<Clip, 'mode' | 'duration'>) {
  return clip.mode === 'once' || clip.mode === 'loop' ? clip.duration : 1
}
/**
 * Demo miss judgement time after the hit: Cytoid's miss threshold for taps and
 * holds (0.3 s, ranked and practice alike) — exactly where the exit fade ends.
 */
export const MISS_DEADLINE = 0.3
/** Hold length of the demo lifecycle loop — the body's collapse window keys off it. */
export const DEMO_HOLD_SECONDS = 1.8
/**
 * `timing`: FAST / SLOW carried by the clear state (rendered for GREAT / GOOD / BAD only).
 * A miss plays the way it does in play: the note is never pressed (holds skip
 * holding), exits from the hit time and is judged MISS at the deadline.
 */
export function lifecycle(kind: NoteKind, time: number, grade: Grade, timing?: Timing): { state: NoteState | null, label: string, t: number, span: number } {
  const miss = grade === 'miss'
  const exit = miss && designs[kind].exit != null
  const hold = designs[kind].hold && !miss ? DEMO_HOLD_SECONDS : 0
  const late = exit ? MISS_DEADLINE : 0
  const clear = tokens.time.clear[grade]
  const t = time % (1.5 + hold + late + clear + 0.65)
  const span = 1.5 + hold
  if (t < 1.5)
    return { state: { phase: 'enter', p: t / 1.5 }, label: 'Approach', t, span }
  if (t < span)
    return { state: { phase: 'holding', t: t - 1.5, progress: (t - 1.5) / hold }, label: 'Holding', t, span }
  if (t < span + late)
    return { state: { phase: 'exit', t: t - span }, label: 'Late', t, span }
  if (t < span + late + clear)
    return { state: miss ? { phase: 'miss', t: t - span - late, since: t - 1.5 } : { phase: 'clear', grade, t: t - span, timing }, label: grade, t, span }
  return { state: null, label: 'Pause', t, span }
}
