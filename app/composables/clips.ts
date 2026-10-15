import type { Clip, Grade, NoteKind, NoteState, Timing } from '@cytoid/notes'
import { designs, tokens } from '@cytoid/notes'

export function clipMax(clip: Pick<Clip, 'mode' | 'duration'>) {
  return clip.mode === 'once' || clip.mode === 'loop' ? clip.duration : 1
}
/** Demo miss judgement time after the hit (the player's bad window). */
export const MISS_DEADLINE = 0.2
/** Hold length of the demo lifecycle loop — the body's collapse window keys off it. */
export const DEMO_HOLD_SECONDS = 1.8
/** `timing`: FAST / SLOW carried by the clear state (rendered for GREAT / GOOD / BAD only). */
export function lifecycle(kind: NoteKind, time: number, grade: Grade, timing?: Timing): { state: NoteState | null, label: string, t: number, span: number } {
  const hold = designs[kind].hold ? DEMO_HOLD_SECONDS : 0
  // exit designs miss the way play does: unjudged past the hit time (exit
  // fade), judged MISS once the hit window closes
  const late = grade === 'miss' && designs[kind].exit ? MISS_DEADLINE : 0
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
    return { state: grade === 'miss' ? { phase: 'miss', t: t - span - late, since: t - span } : { phase: 'clear', grade, t: t - span, timing }, label: grade, t, span }
  return { state: null, label: 'Pause', t, span }
}
