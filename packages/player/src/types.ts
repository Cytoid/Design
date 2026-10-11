/**
 * Cytoid chart format (C2 / `level.json` chart files) — types only.
 * Mirrors the Cytoid game's JSON; see the Cytoid source repo for the
 * authoritative schema.
 */

export interface ChartTempo {
  tick: number
  /** microseconds per beat */
  value: number
}

export interface PagePositionFunction {
  Type: number
  Arguments: number[]
}

export interface ChartPage {
  start_tick: number
  end_tick: number
  scan_line_direction: 1 | -1
  PositionFunction?: PagePositionFunction
  /** precomputed by `parseChart` */
  time?: { start: number, end: number, length: number }
  length?: number
  position?: { top: number, bottom: number, length: number }
}

export interface ChartNote {
  id: number
  type: number
  page_index: number
  tick: number
  x: number
  hold_tick: number
  has_sibling: boolean
  next_id: number
  is_forward: boolean
  approach_rate?: number
  /** drop notes: which edge they come from (0 top / 1 bottom) */
  NoteDirection?: number
  /** precomputed by `parseChart` */
  data?: NoteData
}

export interface NoteData {
  kind: NoteKindId
  direction: 1 | -1
  position: {
    x: number
    /** scan-line ratio 0..1 at the note tick (bottom-origin, like Cytoid) */
    y: number
    endY: number
    fromY: number
    page: ChartPage
  }
  time: number
  timein: number
  timeout: number
  duration: { fadein: number, hold: number }
  /** index of the next node in a drag chain, -1 if none */
  next: number
  /** index of the chain head (for click-drag colour inheritance), self if head */
  head: number
}

export interface ChartEvent {
  type: number
  args: string
}

export interface ChartEventOrder {
  tick: number
  event_list: ChartEvent[]
  /** precomputed by `parseChart` */
  time?: number
}

export interface Chart {
  format_version: number
  time_base: number
  start_offset_time: number
  music_offset: number
  display_boundaries: boolean
  page_list: ChartPage[]
  tempo_list: ChartTempo[]
  event_order_list: ChartEventOrder[]
  note_list: ChartNote[]
  is_start_without_ui?: boolean
}

/** Cytoid `NoteType` ids. */
export type NoteKindId
  = | 'click'
    | 'hold'
    | 'long_hold'
    | 'drag'
    | 'drag_child'
    | 'flick'
    | 'click_drag'
    | 'cdrag_child'
    | 'drop_click'
    | 'drop_drag'

/** legacy C1 chart text — accepted by the loader as a fallback. */
export type LegacyChartText = string

export interface LevelChartEntry {
  type: string
  name?: string
  difficulty: number
  path: string
  music_override?: { path: string }
}

export interface LevelJson {
  id: string
  title: string
  artist: string
  charter: string
  music: { path: string }
  background: { path: string, title?: string, artist?: string }
  charts: LevelChartEntry[]
  preview?: { path: string }
}
