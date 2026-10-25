import type { Clip, NoteDesign, NoteKind, NoteSkin } from '@cytoid/notes'
import { GRADES, NOTE_KINDS } from '@cytoid/notes'
import { describe, expect, it } from 'vitest'
import { createCylheimTargets, cylheimSamples } from '../src/cylheim'

const clip: Clip = { id: 'fixture', mode: 'normalized', duration: 1, draw: () => ({ type: 'circle', r: 1 }) }
const notes = Object.fromEntries(NOTE_KINDS.map(kind => [kind, { kind, enter: clip, clear: { perfect: clip, great: clip, good: clip, bad: clip } }])) as Record<NoteKind, NoteDesign>
const feedback: NoteSkin['feedback'] = {
  judgement: Object.fromEntries(GRADES.map(grade => [grade, clip])) as NoteSkin['feedback']['judgement'],
  timing: Object.fromEntries(GRADES.map(grade => [grade, { fast: clip, slow: clip }])) as NoteSkin['feedback']['timing'],
  combined: Object.fromEntries(GRADES.map(grade => [grade, { fast: clip, slow: clip }])) as NoteSkin['feedback']['combined'],
}
const designs: NoteSkin = { ...notes, feedback }
const CYLHEIM_TARGETS = createCylheimTargets({ designs })

describe('cylheim mapping', () => {
  it('enter timelines end on the hit pose', () => {
    for (const t of CYLHEIM_TARGETS.filter(t => t.pattern.includes('Enter') || t.pattern.includes('DragChild') || t.pattern.includes('Drop'))) {
      const s = cylheimSamples(t)
      expect(Math.max(...s.map(x => x.x)), t.pattern).toBe(1)
    }
  })
  it('hold exports every grouped-popup frame 17–40', () => {
    const hold = CYLHEIM_TARGETS.find(t => t.pattern.includes('Hold_Note-Hold_in'))!
    const frames = cylheimSamples(hold).map(s => s.f)
    for (let f = 17; f <= 40; f++)
      expect(frames).toContain(f)
  })
  it('samples are monotonic in frame number', () => {
    for (const t of CYLHEIM_TARGETS) {
      const xs = cylheimSamples(t).map(s => s.x)
      xs.slice(1).forEach((x, i) => expect(x, t.pattern).toBeGreaterThanOrEqual(xs[i]!))
    }
  })
})
