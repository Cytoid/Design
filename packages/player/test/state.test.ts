import type { Chart } from '../src/types'
import { describe, expect, it } from 'vitest'
import { parseChart } from '../src/chart'
import { chainFollow, deriveFrame, dragSegment, noteStateAt } from '../src/state'

const board = { x: 10, y: 20, width: 300, height: 500 }

function chartWith(): Chart {
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
    note_list: [],
  }
}

/** click at t=1.5 on page 2 (fade-in 1.367 → timein ≈ 0.133) */
function clickChart(): Chart {
  const chart = chartWith()
  chart.note_list = [
    { id: 0, type: 0, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
  ]
  return chart
}

describe('noteStateAt', () => {
  const parsed = parseChart(clickChart())
  const note = parsed.notes[0]!

  it('covers the enter window', () => {
    expect(noteStateAt(note, 0.1, 'perfect')).toBeNull()
    expect(noteStateAt(note, 0.134, 'perfect')).toEqual({ phase: 'enter', p: expect.closeTo(0.001, 2) })
    expect(noteStateAt(note, 1.0, 'perfect')).toEqual({ phase: 'enter', p: expect.closeTo(0.634, 2) })
    expect(noteStateAt(note, 1.49, 'perfect')!.phase).toBe('enter')
  })

  it('covers the clear window per grade', () => {
    expect(noteStateAt(note, 1.5, 'perfect')).toEqual({ phase: 'clear', grade: 'perfect', t: 0 })
    expect(noteStateAt(note, 1.8, 'perfect')).toEqual({ phase: 'clear', grade: 'perfect', t: expect.closeTo(0.3, 3) })
    expect(noteStateAt(note, 2.0, 'perfect')).toBeNull() // past 0.42 s
    expect(noteStateAt(note, 1.95, 'bad')).toEqual({ phase: 'clear', grade: 'bad', t: expect.closeTo(0.45, 3) })
  })

  it('shows miss for the miss window', () => {
    expect(noteStateAt(note, 1.7, 'miss')).toEqual({ phase: 'miss', t: expect.closeTo(0.2, 3) })
    expect(noteStateAt(note, 2.01, 'miss')).toBeNull()
  })
})

describe('hold phases', () => {
  const chart = chartWith()
  chart.note_list = [
    { id: 0, type: 1, page_index: 1, tick: 1440, x: 0.4, hold_tick: 480, has_sibling: false, next_id: 0, is_forward: false },
  ]
  const note = parseChart(chart).notes[0]!
  // hit 1.5 s, hold 0.5 s, fade-in 1.367 s → timein ≈ 0.133 s

  it('enters, holds with progress, then clears', () => {
    expect(noteStateAt(note, 0.5, 'perfect')!.phase).toBe('enter')
    const mid = noteStateAt(note, 1.75, 'perfect')!
    expect(mid.phase).toBe('holding')
    expect(mid.phase === 'holding' && mid.progress).toBeCloseTo(0.5)
    const end = noteStateAt(note, 2.1, 'perfect')!
    expect(end.phase).toBe('clear')
    expect(noteStateAt(note, 2.6, 'perfect')).toBeNull()
  })
})

describe('chainFollow', () => {
  const chart = chartWith()
  chart.note_list = [
    { id: 0, type: 3, page_index: 1, tick: 1200, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 1, is_forward: false },
    { id: 1, type: 4, page_index: 1, tick: 1680, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
  ]
  const parsed = parseChart(chart)
  const head = parsed.notes[0]!
  const child = parsed.notes[1]!
  const nextOf = (n: typeof head) => (n.next >= 0 ? parsed.notes[n.next]! : null)
  // head hits at 1.25 s, child at 1.75 s

  it('is null before the head is judged and after the chain ends', () => {
    expect(chainFollow(head, nextOf, 0.9, board)).toBeNull()
    expect(chainFollow(head, nextOf, 1.8, board)).toBeNull()
  })

  it('interpolates between chain nodes while the chain is live', () => {
    const mid = chainFollow(head, nextOf, 1.5, board)!
    expect(mid.x).toBeCloseTo(board.x + (0.2 + (0.8 - 0.2) * 0.5) * board.width)
    const atHead = chainFollow(head, nextOf, 1.2501, board)!
    expect(atHead.x).toBeLessThan(mid.x)
  })

  it('does not apply to children', () => {
    expect(chainFollow(child, nextOf, 1.5, board)).toBeNull()
  })

  it('keeps following across a third node (multi-segment regression)', () => {
    const chart = chartWith()
    chart.note_list = [
      { id: 0, type: 6, page_index: 1, tick: 1200, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 1, is_forward: false }, // t=1.25
      { id: 1, type: 7, page_index: 1, tick: 1680, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 2, is_forward: false }, // t=1.75
      { id: 2, type: 7, page_index: 1, tick: 1920, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false }, // t=2.0
    ]
    const parsed = parseChart(chart)
    const head = parsed.notes[0]!
    const next = (n: typeof head) => (n.next >= 0 ? parsed.notes[n.next]! : null)
    // mid second segment (C1 → C2): head must still be visible, between them
    const mid = chainFollow(head, next, 1.875, board)!
    expect(mid.x).toBeCloseTo(board.x + 0.65 * board.width)
    // gone once the chain ends
    expect(chainFollow(head, next, 2.05, board)).toBeNull()
  })
})

describe('dragSegment', () => {
  const chart = chartWith()
  chart.note_list = [
    { id: 0, type: 3, page_index: 1, tick: 1200, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 1, is_forward: false },
    { id: 1, type: 4, page_index: 1, tick: 1680, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
  ]
  const parsed = parseChart(chart)
  const a = parsed.notes[0]!
  const b = parsed.notes[1]!

  it('grows the lead through the intro window', () => {
    const early = dragSegment(a, b, a.timein - 0.14, board)
    expect(early).toBeNull() // lead 0 ≤ trail 0
    const mid = dragSegment(a, b, 1.0, board)!
    expect(mid.lead).toBeGreaterThan(0)
    expect(mid.trail).toBe(0)
  })

  it('retracts the trail after the source hit', () => {
    const seg = dragSegment(a, b, 1.5, board)!
    expect(seg.trail).toBeGreaterThan(0)
    expect(seg.lead).toBe(1)
  })

  it('disappears once the destination is hit', () => {
    expect(dragSegment(a, b, b.time, board)).toBeNull()
  })
})

describe('deriveFrame ordering', () => {
  it('renders later notes first (bottom of the stack)', () => {
    const chart = chartWith()
    chart.note_list = [
      { id: 0, type: 0, page_index: 0, tick: 480, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
      { id: 1, type: 0, page_index: 0, tick: 600, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ]
    const parsed = parseChart(chart)
    const frame = deriveFrame(parsed, 0.9, { board })
    expect(frame.notes.map(d => d.note.id)).toEqual([1, 0]) // note 1 (later) first
    expect(frame.scanline).not.toBeNull()
  })

  it('maps board coordinates with y flipped (ratio 0 = bottom)', () => {
    const chart = chartWith()
    chart.note_list = [
      { id: 0, type: 0, page_index: 0, tick: 480, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ]
    const parsed = parseChart(chart)
    // first-page notes have no fade-in: they are visible from their hit time on
    const frame = deriveFrame(parsed, 0.6, { board })
    const d = frame.notes[0]!
    // tick 480 → ratio 0.5, page 1 up → y ratio 0.5 → canvas mid
    expect(d.pos.y).toBeCloseTo(board.y + board.height / 2)
    expect(d.pos.x).toBeCloseTo(board.x + board.width / 2)
  })
})
