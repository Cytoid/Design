import type { Grade } from '../tokens'
import type { ClearGrade } from './types'

export const TIMINGS = ['fast', 'slow'] as const
export type Timing = typeof TIMINGS[number]

export const TIMING_TEXT: Record<Timing, string> = { fast: 'FAST', slow: 'SLOW' }

/** Grades that carry a timing label. */
export const TIMED_GRADES = ['great', 'good', 'bad'] as const satisfies readonly ClearGrade[]
export type TimedGrade = typeof TIMED_GRADES[number]

export function showsTiming(grade: Grade): grade is TimedGrade {
  return (TIMED_GRADES as readonly Grade[]).includes(grade)
}

/** FAST / SLOW from a signed timing error (press time − chart time, seconds). */
export function timingOf(error: number): Timing {
  return error < 0 ? 'fast' : 'slow'
}

/** Where the label sits: under the judgement text, or alone in the centre. */
export type TimingSlot = 'stacked' | 'centre'
