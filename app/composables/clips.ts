import type { Clip, Grade, NoteKind, NoteState, Timing } from '@cytoid/notes'
import { designs, tokens } from '@cytoid/notes'

export function clipMax(clip: Pick<Clip, 'mode' | 'duration'>) {
  return clip.mode === 'once' || clip.mode === 'loop' ? clip.duration : 1
}
/** Hold length of the demo lifecycle loop — the body's collapse window keys off it. */
export const DEMO_HOLD_SECONDS = 1.8
/** `timing`: FAST / SLOW carried by the clear state (rendered for GREAT / GOOD / BAD only). */
export function lifecycle(kind: NoteKind, time: number, grade: Grade, timing?: Timing): { state: NoteState | null, label: string, t: number, span: number } {
  const hold = designs[kind].hold ? DEMO_HOLD_SECONDS : 0
  const clear = tokens.time.clear[grade]
  const t = time % (1.5 + hold + clear + 0.65)
  const span = 1.5 + hold
  if (t < 1.5)
    return { state: { phase: 'enter', p: t / 1.5 }, label: 'Approach', t, span }
  if (t < span)
    return { state: { phase: 'holding', t: t - 1.5, progress: (t - 1.5) / hold }, label: 'Holding', t, span }
  if (t < span + clear)
    return { state: grade === 'miss' ? { phase: 'miss', t: t - span } : { phase: 'clear', grade, t: t - span, timing }, label: grade, t, span }
  return { state: null, label: 'Pause', t, span }
}
