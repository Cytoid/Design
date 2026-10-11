import type { Chart } from '../src/types'
import { describe, expect, it } from 'vitest'
import { fadeInTime, pageY, parseChart, scanlineRatio, tickToTime, timeToTick } from '../src/chart'

/** 120 BPM, time_base 480, three pages of 960 ticks (2 beats). */
function baseChart(): Chart {
  return {
    format_version: 1,
    time_base: 480,
    start_offset_time: 0,
    music_offset: 0.25,
    display_boundaries: false,
    page_list: [
      { start_tick: 0, end_tick: 960, scan_line_direction: 1 },
      { start_tick: 960, end_tick: 1920, scan_line_direction: -1 },
      { start_tick: 1920, end_tick: 2880, scan_line_direction: 1, PositionFunction: { Type: 0, Arguments: [0.5, 0] } },
    ],
    tempo_list: [{ tick: 0, value: 500000 }],
    event_order_list: [],
    note_list: [],
  }
}

describe('tick/time conversion', () => {
  it('converts ticks at 120 BPM', () => {
    const chart = baseChart()
    expect(tickToTime(chart, 0)).toBe(0)
    expect(tickToTime(chart, 480)).toBe(0.5)
    expect(tickToTime(chart, 960)).toBeCloseTo(1)
    expect(tickToTime(chart, 1920)).toBeCloseTo(2)
  })

  it('handles tempo changes', () => {
    const chart = baseChart()
    chart.tempo_list.push({ tick: 960, value: 1000000 }) // 60 BPM from tick 960
    expect(tickToTime(chart, 1440)).toBeCloseTo(2)
    expect(tickToTime(chart, 1920)).toBeCloseTo(3)
  })

  it('round-trips through timeToTick', () => {
    const chart = baseChart()
    chart.tempo_list.push({ tick: 960, value: 750000 })
    for (const tick of [0, 240, 960, 1440, 2000]) {
      const t = tickToTime(chart, tick)
      expect(timeToTick(chart, t)).toBeCloseTo(tick, 4)
    }
  })
})

describe('page geometry', () => {
  it('applies PositionFunction scale/offset', () => {
    const chart = parseChart(baseChart())
    const page = chart.pages[2]!
    expect(page.position!.top).toBeCloseTo(0.75)
    expect(page.position!.bottom).toBeCloseTo(0.25)
    expect(pageY(page, 0.5)).toBeCloseTo(0.5)
    expect(pageY(page, 1)).toBeCloseTo(0.75)
  })

  it('flips ratio on downward pages for the scanline', () => {
    const pages = parseChart(baseChart()).pages
    expect(scanlineRatio(pages, 0.5)).toBeCloseTo(0.5) // mid page 1 (up)
    expect(scanlineRatio(pages, 1.5)).toBeCloseTo(0.5) // mid page 2 (down)
    expect(scanlineRatio(pages, 0)).toBe(0)
    expect(scanlineRatio(pages, 1)).toBeCloseTo(1) // page 1 ends top
    expect(scanlineRatio(pages, 1.999)).toBeCloseTo(0) // page 2 ends bottom
  })
})

describe('fade-in timing', () => {
  it('is zero on the first page and nominal afterwards', () => {
    const chart = baseChart()
    chart.note_list = [
      { id: 0, type: 0, page_index: 0, tick: 480, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
      { id: 1, type: 0, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ]
    expect(fadeInTime(chart, chart.note_list[0]!)).toBe(0)
    expect(fadeInTime(chart, chart.note_list[1]!)).toBeCloseTo(1.367)
  })

  it('uses the shorter drag window and scales by approach_rate', () => {
    const chart = baseChart()
    chart.note_list = [
      { id: 0, type: 3, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
      { id: 1, type: 0, page_index: 1, tick: 1440, x: 0.5, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false, approach_rate: 0.5 },
    ]
    expect(fadeInTime(chart, chart.note_list[0]!)).toBeCloseTo(1.175)
    expect(fadeInTime(chart, chart.note_list[1]!)).toBeCloseTo(1.367 / 0.5)
  })
})

describe('parseChart', () => {
  it('computes note times, positions and drop approach', () => {
    const chart = baseChart()
    chart.note_list = [
      { id: 0, type: 8, page_index: 0, tick: 480, x: 0.3, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false, NoteDirection: 0 },
      { id: 1, type: 0, page_index: 1, tick: 1440, x: 0.7, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ]
    const parsed = parseChart(chart)
    const drop = parsed.notes[0]!
    expect(drop.kind).toBe('drop_click')
    expect(drop.time).toBeCloseTo(0.5)
    expect(drop.duration.fadein).toBeCloseTo(960 / 480 / 3) // page span / 3
    expect(drop.position.y).toBeCloseTo(0.5)
    expect(drop.position.fromY).toBe(1) // enters from the top edge

    const click = parsed.notes[1]!
    expect(click.kind).toBe('click')
    expect(click.direction).toBe(-1) // page 2 scans downward
    expect(click.position.y).toBeCloseTo(0.5)
    expect(click.time).toBeCloseTo(1.5)
  })

  it('resolves hold end position across pages and chain links', () => {
    const chart = baseChart()
    chart.note_list = [
      { id: 0, type: 1, page_index: 0, tick: 480, x: 0.4, hold_tick: 960, has_sibling: false, next_id: 0, is_forward: false },
      { id: 1, type: 3, page_index: 1, tick: 1200, x: 0.2, hold_tick: 0, has_sibling: false, next_id: 2, is_forward: false },
      { id: 2, type: 4, page_index: 1, tick: 1680, x: 0.8, hold_tick: 0, has_sibling: false, next_id: 0, is_forward: false },
    ]
    const parsed = parseChart(chart)
    const hold = parsed.notes[0]!
    expect(hold.kind).toBe('hold')
    expect(hold.time).toBeCloseTo(0.5)
    expect(hold.duration.hold).toBeCloseTo(1) // 480 ticks → 0.5 s… hold_tick 960 → 1 s
    expect(hold.position.y).toBeCloseTo(0.5)
    expect(hold.position.endY).toBeCloseTo(0.5) // hold ends mid page 2 (scans down → 1 − 0.5)

    const head = parsed.notes[1]!
    const child = parsed.notes[2]!
    expect(head.next).toBe(2)
    expect(head.kind).toBe('drag')
    expect(child.kind).toBe('drag_child')
    expect(child.head).toBe(1) // colour inheritance anchor
  })
})
