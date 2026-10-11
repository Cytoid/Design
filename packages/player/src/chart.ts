/**
 * Chart parsing & precomputation — a direct TS port of the timing core of
 * cytoid-player-core (tempo → time, page positions incl. PositionFunction,
 * note fade-in with approach_rate, drag chain linking). The DOM/CSS parts of
 * the original are gone: everything here is pure data, rendered later by
 * `stage.ts` from the design library's vector clips.
 */
import type { Chart, ChartNote, ChartPage, NoteData, NoteKindId } from './types'

export const BASIC_FADE_IN = 1.367

export interface ParsedNote extends NoteData {
  id: number
  type: number
  raw: ChartNote
}

export interface ParsedChart {
  timeBase: number
  musicOffset: number
  pages: ChartPage[]
  notes: ParsedNote[]
  /** notes sorted by tick ascending (render/lookup order) */
  sorted: ParsedNote[]
  duration: number
}

export function tickToTime(chart: Pick<Chart, 'tempo_list' | 'time_base'>, tick: number): number {
  // self-contained: does not rely on precomputed `time` fields
  let time = 0
  let prevTick = 0
  let value = chart.tempo_list[0]?.value ?? 0
  for (const t of chart.tempo_list) {
    if (tick < t.tick)
      break
    time += (t.tick - prevTick) * (value / 1e6 / chart.time_base)
    prevTick = t.tick
    value = t.value
  }
  return time + (tick - prevTick) * (value / 1e6 / chart.time_base)
}

export function timeToTick(chart: Pick<Chart, 'tempo_list' | 'time_base'>, time: number): number {
  let tick = 0
  let elapsed = 0
  let value = chart.tempo_list[0]?.value ?? 0
  for (const t of chart.tempo_list) {
    const segEnd = tickToTime(chart, t.tick)
    if (time < segEnd)
      break
    tick = t.tick
    elapsed = segEnd
    value = t.value
  }
  return tick + (time - elapsed) * (chart.time_base * 1e6 / value)
}

/** Cytoid NoteType id → design note kind (see `tokens.NOTE_KINDS`). */
export const KIND_OF: Record<NoteKindId, string> = {
  click: 'click',
  hold: 'hold',
  long_hold: 'long-hold',
  drag: 'drag-head',
  drag_child: 'drag-child',
  flick: 'flick',
  click_drag: 'click-drag-head',
  cdrag_child: 'click-drag-child',
  drop_click: 'drop-click',
  drop_drag: 'drop-drag',
}

export const DRAG_TYPES = new Set<NoteKindId>(['drag', 'drag_child', 'click_drag', 'cdrag_child'])
export const HOLD_TYPES = new Set<NoteKindId>(['hold', 'long_hold'])
export const DROP_TYPES = new Set<NoteKindId>(['drop_click', 'drop_drag'])

/**
 * Approach window (intro → hit) in seconds. Port of the original formula:
 * notes inherit page tempo, slow pages stretch the window, `approach_rate`
 * scales it, drag chains use the shorter Cytoid drag window.
 */
export function fadeInTime(chart: Chart, note: ChartNote): number {
  const basicTime = BASIC_FADE_IN
  const tick = note.tick
  const ar = note.approach_rate ?? 1
  // valid charts always resolve note.page_index
  const page = chart.page_list[note.page_index]!
  const prevPage = chart.page_list[note.page_index - 1] ?? null
  const prevPrevPageEnd = chart.page_list[note.page_index - 2]?.end_tick ?? 0
  if (!prevPage || (ar && ar === 0))
    return 0

  const pageRatio = (tick - prevPage.end_tick) / (page.end_tick - prevPage.end_tick)

  const tempo = (tickToTime(chart, page.end_tick) - tickToTime(chart, prevPage.end_tick)) * pageRatio
    + (tickToTime(chart, prevPage.end_tick) - tickToTime(chart, prevPrevPageEnd)) * (basicTime - pageRatio)

  let speed = tempo >= basicTime ? 1 : basicTime / tempo
  speed *= ar
  return DRAG_TYPES.has(noteType(note)) ? 1.175 / speed : basicTime / speed
}

function noteType(note: ChartNote): NoteKindId {
  return ([
    'click',
    'hold',
    'long_hold',
    'drag',
    'drag_child',
    'flick',
    'click_drag',
    'cdrag_child',
    'drop_click',
    'drop_drag',
  ] as NoteKindId[])[note.type] ?? 'click'
}

/** Scan-line ratio (bottom-origin, 0..1) of `tick` within its page. */
export function pageRatio(page: ChartPage, tick: number): number {
  let r = (tick - page.start_tick) / (page.end_tick - page.start_tick)
  if (page.scan_line_direction < 0)
    r = 1 - r
  return r
}

/** Map a bottom-origin page ratio through the page's PositionFunction band. */
export function pageY(page: ChartPage, ratio: number): number {
  const p = page.position ?? { top: 1, bottom: 0, length: 1 }
  return Math.min(Math.max(ratio * (p.top - p.bottom) + p.bottom, 0), 1)
}

/** Precompute tempo times, page geometry and all note data. */
export function parseChart(input: Chart): ParsedChart {
  const chart: Chart = {
    ...input,
    music_offset: input.music_offset ?? 0,
    tempo_list: input.tempo_list.map((t, i) => ({
      ...t,
      time: i === 0 ? 0 : undefined,
    })),
  }
  // pages
  for (const page of chart.page_list) {
    const start = tickToTime(chart, page.start_tick)
    const end = tickToTime(chart, page.end_tick)
    page.time = { start, end, length: end - start }
    page.length = page.end_tick - page.start_tick
    const pos = { top: 1, bottom: 0, length: 1 }
    if (page.PositionFunction && page.PositionFunction.Type === 0) {
      const scale = page.PositionFunction.Arguments[0] ?? 1
      const offset = page.PositionFunction.Arguments[1] ?? 0
      pos.top = (1 + offset) / 2 + scale / 2
      pos.bottom = (1 + offset) / 2 - scale / 2
      pos.length = pos.top - pos.bottom
    }
    page.position = pos
  }
  // notes — first pass: positions & timings
  for (const note of chart.note_list) {
    const kind = noteType(note)
    // valid charts always resolve note.page_index
    const page = chart.page_list[note.page_index]!
    const direction = page.scan_line_direction
    const ratio = pageRatio(page, note.tick)
    const y = pageY(page, ratio)
    let endY = y
    let fromY = y
    if (HOLD_TYPES.has(kind)) {
      const holdEndTick = note.tick + note.hold_tick
      for (const p of chart.page_list) {
        if (p.start_tick < holdEndTick && p.end_tick >= holdEndTick) {
          endY = pageY(p, pageRatio(p, holdEndTick))
          break
        }
      }
    }
    if (DROP_TYPES.has(kind))
      fromY = 1 - (note.NoteDirection ?? 0)

    const time = tickToTime(chart, note.tick)
    let fadein = fadeInTime(chart, note)
    const hold = tickToTime(chart, note.tick + note.hold_tick) - time
    if (DROP_TYPES.has(kind))
      fadein = (page.end_tick - page.start_tick) / chart.time_base / 3

    const next = note.next_id > 0 && chart.note_list[note.next_id] ? note.next_id : -1
    note.data = {
      kind,
      direction,
      position: { x: note.x, y, endY, fromY, page },
      time,
      timein: time - fadein,
      timeout: time + hold,
      duration: { fadein, hold },
      next,
      head: -1,
    }
  }
  // chain heads (colour inheritance anchor): for every note, walk back to
  // the chain head; isolated notes head themselves
  const noteList = chart.note_list
  for (let i = 0; i < noteList.length; i++) {
    let cur = i
    let hops = 0
    while (noteList[cur]!.data!.head < 0) {
      if (hops++ > noteList.length)
        break // cycle guard: malformed chain
      let back = -1
      for (let j = 0; j < noteList.length; j++) {
        if (noteList[j]!.data!.next === cur) {
          back = j
          break
        }
      }
      if (back < 0) {
        noteList[cur]!.data!.head = cur
        break
      }
      cur = back
    }
    noteList[i]!.data!.head = noteList[cur]!.data!.head
  }
  const notes: ParsedNote[] = chart.note_list.map(n => ({ ...n.data!, id: n.id, type: n.type, raw: n }))
  const sorted = [...notes].sort((a, b) => a.time - b.time || a.id - b.id)
  const last = sorted[sorted.length - 1]
  return {
    timeBase: chart.time_base,
    musicOffset: chart.music_offset,
    pages: chart.page_list,
    notes,
    sorted,
    duration: last ? last.timeout + 1 : 0,
  }
}

/** The page sounding at time `t` (scanline position), or null. */
export function pageAtTime(pages: ChartPage[], t: number): ChartPage | null {
  for (const p of pages) {
    if (t >= p.time!.start && t < p.time!.end)
      return p
  }
  return null
}

/** Scan-line bottom-origin ratio at time `t` across the whole chart. */
export function scanlineRatio(pages: ChartPage[], t: number): number | null {
  const page = pageAtTime(pages, t)
  if (!page)
    return null
  const r = (t - page.time!.start) / page.time!.length
  return pageY(page, page.scan_line_direction > 0 ? r : 1 - r)
}
