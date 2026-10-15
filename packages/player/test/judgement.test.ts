import type { Chart } from '../src/types'
import { describe, expect, it } from 'vitest'
import { parseChart } from '../src/chart'
import { JudgeEngine, missThreshold } from '../src/judgement'

const board = { width: 800, height: 600 }

function chartWith(notes: Chart['note_list']): Chart {
  return {
    format_version: 1,
    time_base: 480,
    start_offset_time: 0,
    music_offset: 0,
    display_boundaries: false,
    page_list: [
      { start_tick: 0, end_tick: 960, scan_line_direction: 1 },
      { start_tick: 960, end_tick: 1920, scan_line_direction: -1 },
    ],
    tempo_list: [{ tick: 0, value: 500000 }],
    event_order_list: [],
    note_list: notes,
  }
}

/** click at x=0.5, t=1.5 on page 2 */
function clickChart(overrides: Partial<Chart['note_list'][number]> = {}) {
  return chartWith([
    { id: 0, type: 0, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false, ...overrides },
  ])
}

const R = 64 // radiusPx

describe('press grading windows', () => {
  it('grades by |dt| half-widths', () => {
    const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
    expect(engine.press(400, 300, 1.5 + 0.03, 1)).toBe(0)
    expect(engine.gradeOf(parseChart(clickChart()).notes[0]!)).toBe('perfect')
    expect(engine.score().perfect).toBe(1)
  })

  it('accepts inside the bad window and grades great/good/bad (ranked, late)', () => {
    for (const [dt, want] of [[0.06, 'great'], [0.12, 'good'], [0.18, 'bad']] as const) {
      const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
      engine.press(400, 300, 1.5 + dt, 1)
      expect(engine.score()[want]).toBe(1)
    }
  })

  it('rejects presses outside the time window or the hit radius', () => {
    const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
    expect(engine.press(400, 300, 1.5 + 0.21, 1)).toBeNull()
    expect(engine.press(400, 300 + R * 1.7, 1.5, 1)).toBeNull()
    expect(engine.press(400 + R * 1.7, 300, 1.5, 1)).toBeNull()
  })

  it('picks the nearest note by dt then distance', () => {
    const chart = chartWith([
      { id: 0, type: 0, page_index: 1, tick: 1392, x: 0.45, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=1.45
      { id: 1, type: 0, page_index: 1, tick: 1488, x: 0.55, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=1.55
    ])
    const engine = new JudgeEngine(parseChart(chart), { radiusPx: R, board })
    expect(engine.press(400, 300, 1.46, 1)).toBe(0)
  })
})

describe('fast / slow timing', () => {
  it('records FAST before the beat and SLOW after it, for great/good/bad only', () => {
    for (const [dt, want] of [[-0.07, 'fast'], [0.12, 'slow'], [-0.18, 'fast'], [0.03, null], [-0.03, null]] as const) {
      const parsed = parseChart(clickChart())
      const engine = new JudgeEngine(parsed, { radiusPx: R, board })
      engine.press(400, 300, 1.5 + dt, 1)
      expect(engine.timingFor(parsed.notes[0]!), `dt ${dt}`).toBe(want)
      expect(engine.score().fast).toBe(want === 'fast' ? 1 : 0)
      expect(engine.score().slow).toBe(want === 'slow' ? 1 : 0)
    }
  })

  it('misses carry no timing', () => {
    const parsed = parseChart(clickChart())
    const engine = new JudgeEngine(parsed, { radiusPx: R, board })
    engine.update(1.8)
    expect(engine.timingFor(parsed.notes[0]!)).toBeNull()
  })
})

describe('pending → miss lifecycle', () => {
  it('keeps unpressed notes at hit pose, misses after the deadline', () => {
    const parsed = parseChart(clickChart())
    const note = parsed.notes[0]!
    const engine = new JudgeEngine(parsed, { radiusPx: R, board })
    expect(engine.gradeOf(note)).toBe('pending')
    engine.update(1.55)
    expect(engine.gradeOf(note)).toBe('pending') // still inside the window
    engine.update(1.78)
    expect(engine.gradeOf(note)).toBe('pending') // past the last band, before the 0.3 s miss threshold
    engine.update(1.81)
    expect(engine.gradeOf(note)).toBe('miss')
    expect(engine.anchorOf(note)).toBeCloseTo(1.8) // anchored at the deadline, not the frame
  })

  it('pending does not render as miss inside the window (the bug this guards)', () => {
    const parsed = parseChart(clickChart())
    const note = parsed.notes[0]!
    const engine = new JudgeEngine(parsed, { radiusPx: R, board })
    engine.update(1.5)
    expect(engine.gradeOf(note)).not.toBe('miss')
  })
})

describe('hold judgement', () => {
  function holdChart() {
    return chartWith([
      { id: 0, type: 1, page_index: 1, tick: 1440, x: 0.5, hold_tick: 480, has_sibling: false, next_id: 0, is_forward: false }, // t=1.5, ends 2.0
    ])
  }

  it('clears when held to the end', () => {
    const engine = new JudgeEngine(parseChart(holdChart()), { radiusPx: R, board })
    engine.press(400, 300, 1.5, 1)
    engine.update(1.8)
    expect(engine.gradeOf(parseChart(holdChart()).notes[0]!)).toBe('perfect')
    engine.release(2.05, 1)
    engine.update(2.1)
    expect(engine.score().perfect).toBe(1)
  })

  it('misses when lifted early', () => {
    const engine = new JudgeEngine(parseChart(holdChart()), { radiusPx: R, board })
    engine.press(400, 300, 1.5, 1)
    engine.release(1.7, 1) // early lift
    expect(engine.score().miss).toBe(1)
  })

  it('misses when never pressed', () => {
    const engine = new JudgeEngine(parseChart(holdChart()), { radiusPx: R, board })
    engine.update(1.85) // past hit time + miss threshold
    expect(engine.score().miss).toBe(1)
  })
})

describe('ranked / practice (Cytoid windows)', () => {
  it('asymmetric bands: early presses get more room', () => {
    for (const [dt, want] of [[-0.05, 'great'], [-0.18, 'good'], [-0.35, 'bad'], [0.16, 'bad']] as const) {
      const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
      engine.press(400, 300, 1.5 + dt, 1)
      expect(engine.score()[want], `${dt}`).toBe(1)
    }
  })
  it('ranked ignores late presses between the last band and the miss threshold', () => {
    const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
    expect(engine.press(400, 300, 1.75, 1)).toBeNull()
  })
  it('practice widens the bands; the miss threshold stays 0.3 s', () => {
    const parsed = parseChart(clickChart())
    const engine = new JudgeEngine(parsed, { radiusPx: R, board, mode: 'practice' })
    expect(engine.press(400, 300, 1.78, 1)).toBe(0)
    expect(engine.score().bad).toBe(1)
    const idle = new JudgeEngine(parsed, { radiusPx: R, board, mode: 'practice' })
    idle.update(1.79)
    expect(idle.gradeOf(parsed.notes[0]!)).toBe('pending')
    idle.update(1.81)
    expect(idle.gradeOf(parsed.notes[0]!)).toBe('miss')
  })
  it('miss thresholds per kind (Cytoid GetDefaultMissThreshold)', () => {
    expect(missThreshold('click')).toBe(0.3)
    expect(missThreshold('flick')).toBe(0.3)
    expect(missThreshold('hold')).toBe(0.3)
    expect(missThreshold('drag_child')).toBe(0.15)
    expect(missThreshold('drop_click')).toBe(0.2)
  })
})

describe('drag chains', () => {
  function chainChart(kind: number) {
    return chartWith([
      { id: 0, type: kind, page_index: 1, tick: 1200, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 1, is_forward: false }, // t=1.25
      { id: 1, type: 4, page_index: 1, tick: 1680, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=1.75
    ])
  }

  it('drag children auto-clear once the head is hit', () => {
    const engine = new JudgeEngine(parseChart(chainChart(3)), { radiusPx: R, board })
    engine.press(160, 150, 1.25, 1) // head (x=0.2 → 160 px, down-page ratio 0.75 → y=150)
    engine.update(1.8)
    expect(engine.score().perfect).toBe(2)
  })

  it('drag children miss when the head is missed', () => {
    const engine = new JudgeEngine(parseChart(chainChart(3)), { radiusPx: R, board })
    engine.update(1.6) // head deadline passed
    engine.update(1.8)
    expect(engine.score().miss).toBe(2)
  })

  it('click-drag children need the press held; release breaks the chain', () => {
    const engine = new JudgeEngine(parseChart(chainChart(6)), { radiusPx: R, board })
    engine.press(160, 150, 1.25, 1)
    engine.release(1.4, 1) // lifted before the child
    engine.update(1.8)
    expect(engine.score().miss).toBe(1) // child missed, head was perfect
    expect(engine.score().perfect).toBe(1)
  })

  it('click-drag children clear while the press is held', () => {
    const engine = new JudgeEngine(parseChart(chainChart(6)), { radiusPx: R, board })
    engine.press(160, 150, 1.25, 1)
    engine.update(1.8)
    expect(engine.score().perfect).toBe(2)
  })
})

describe('finalize & score', () => {
  it('sweeps everything pending as missed', () => {
    const engine = new JudgeEngine(parseChart(clickChart()), { radiusPx: R, board })
    engine.finalize(99)
    const s = engine.score()
    expect(s.miss).toBe(1)
    expect(s.judged).toBe(1)
  })
})

describe('flick swipes', () => {
  function flickChart() {
    return chartWith([
      { id: 0, type: 5, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ])
  }

  it('a plain tap does not clear a flick', () => {
    const engine = new JudgeEngine(parseChart(flickChart()), { radiusPx: R, board })
    expect(engine.press(400, 300, 1.5, 1)).toBeNull()
    expect(engine.score().judged).toBe(0)
  })

  it('a swipe clears it, graded by timing', () => {
    const engine = new JudgeEngine(parseChart(flickChart()), { radiusPx: R, board })
    engine.press(400, 380, 1.42, 1) // press nearby, no travel yet
    expect(engine.move(400, 340, 1.49, 1)).toBe(0) // 40 px travel → perfect window
    expect(engine.score().perfect).toBe(1)
  })

  it('short travel does not clear', () => {
    const engine = new JudgeEngine(parseChart(flickChart()), { radiusPx: R, board })
    engine.press(400, 320, 1.45, 1)
    expect(engine.move(400, 300, 1.49, 1)).toBeNull() // 20 px < SWIPE_MIN
    expect(engine.score().judged).toBe(0)
  })

  it('whiffs when the swipe is outside the window or radius', () => {
    const engine = new JudgeEngine(parseChart(flickChart()), { radiusPx: R, board })
    engine.press(400, 300, 1.0, 1)
    expect(engine.move(400, 200, 1.9, 1)).toBeNull() // dt 0.4 > bad
    engine2()
    function engine2() {
      const e = new JudgeEngine(parseChart(flickChart()), { radiusPx: R, board })
      e.press(100, 100, 1.45, 1)
      expect(e.move(100, 300, 1.49, 1)).toBeNull() // 200 px away from the note
    }
  })
})

describe('anchors & combo', () => {
  it('records the actual press time as anchor', () => {
    const parsed = parseChart(clickChart())
    const engine = new JudgeEngine(parsed, { radiusPx: R, board })
    engine.press(400, 300, 1.54, 1) // late press
    expect(engine.anchorOf(parsed.notes[0]!)).toBeCloseTo(1.54)
  })

  it('anchor is null while pending', () => {
    const parsed = parseChart(clickChart())
    const engine = new JudgeEngine(parsed, { radiusPx: R, board })
    expect(engine.anchorOf(parsed.notes[0]!)).toBeNull()
  })

  it('combo resets on miss and keeps max', () => {
    const chart = chartWith([
      { id: 0, type: 0, page_index: 0, tick: 480, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=0.5
      { id: 1, type: 0, page_index: 0, tick: 960, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=1.0
    ])
    const engine = new JudgeEngine(parseChart(chart), { radiusPx: R, board })
    engine.press(160, 300, 0.5, 1) // perfect → combo 1
    expect(engine.score().combo).toBe(1)
    engine.update(1.35) // note 1 passes its miss threshold → miss
    expect(engine.score().combo).toBe(0)
    expect(engine.score().maxCombo).toBe(1)
    expect(engine.score().miss).toBe(1)
  })

  it('bad breaks the combo too', () => {
    const chart = chartWith([
      { id: 0, type: 0, page_index: 0, tick: 480, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
      { id: 1, type: 0, page_index: 1, tick: 1440, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=1.5
    ])
    const engine = new JudgeEngine(parseChart(chart), { radiusPx: R, board })
    engine.press(160, 300, 0.5, 1)
    engine.press(640, 300, 1.68, 2) // dt 0.18 → bad
    const s = engine.score()
    expect(s.bad).toBe(1)
    expect(s.combo).toBe(0)
    expect(s.maxCombo).toBe(1)
  })
})
