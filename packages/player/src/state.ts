/**
 * Per-frame derivation of everything the player renders: note phases, drag
 * chains, scanline. Pure functions of (parsed chart, time, options) — no
 * DOM, no Pixi, fully unit-testable. `stage.ts` turns the output into
 * display objects.
 */
import type { Direction, Grade, NoteKind, NoteState } from '@cytoid/notes'
import type { ParsedChart, ParsedNote } from './chart'
import type { JudgeGrade } from './judgement'
import { clamp01 } from '@cytoid/notes'
import { HOLD_TYPES, KIND_OF, pageAtTime, scanlineRatio } from './chart'

export interface BoardTransform {
  /** board left/top in px (canvas space) */
  x: number
  y: number
  width: number
  height: number
}

export interface Position { x: number, y: number }

export interface DerivedNote {
  note: ParsedNote
  kind: NoteKind
  /** phase for `renderNote` (enter / holding / clear / miss); null = clear effect already finished (a following chain head) */
  state: NoteState | null
  /** actual press time when judged (play mode); null = chart-timed */
  anchor: number | null
  /** note centre in board-local px (origin: board top-left), +y down */
  pos: Position
  /** while a triggered drag head follows the scan line: live centre */
  follow: Position | null
  /** chain heading (radians, 0 = up) when the head points at a next node */
  heading: number
}

export interface DragSegment {
  key: string
  from: Position
  to: Position
  lead: number
  trail: number
  /** scan direction of the destination page (alt colour) */
  direction: Direction
}

export interface DerivedFrame {
  notes: DerivedNote[]
  segments: DragSegment[]
  /** scanline bottom-origin ratio, null when outside any page */
  scanline: number | null
  pageDirection: 1 | -1
}

export interface DeriveOptions {
  /** board-space transform */
  board: BoardTransform
  /** judgement grade per note (autoplay preview or a live JudgeEngine). `'pending'` keeps the note at its hit pose. */
  grades?: (note: ParsedNote, index: number) => JudgeGrade
  /** actual press time per note (play mode) — effects / hold progress anchor here */
  anchorOf?: (note: ParsedNote) => number | null
}

/** Board-space centre of a note (x: 0..1, ratio y: 0 bottom → 1 top). */
export function notePos(note: ParsedNote, ratioY: number, board: BoardTransform): Position {
  return {
    x: board.x + note.position.x * board.width,
    y: board.y + (1 - ratioY) * board.height,
  }
}

/** Cytoid clear-effect window per grade (seconds). */
export function clearDuration(grade: Grade): number {
  return grade === 'miss' ? 0.5 : ({ perfect: 0.42, great: 0.46, good: 0.52, bad: 0.56 } as const)[grade]
}

/** Phase of one note at time `t`, or null when off-screen. `anchor` = actual press time (play mode). */
export function noteStateAt(note: ParsedNote, t: number, grade: JudgeGrade, anchor: number | null = null): NoteState | null {
  if (t < note.timein)
    return null
  if (t < note.time && anchor == null)
    return { phase: 'enter', p: note.duration.fadein > 0 ? clamp01((t - note.timein) / note.duration.fadein) : 1 }
  if (grade === 'pending')
    return { phase: 'enter', p: 1 } // waiting at the scanline for input
  // past the hit time: effects key off the actual press when one happened
  const hit = anchor ?? note.time
  if (grade === 'miss')
    return t - hit <= clearDuration('miss') ? { phase: 'miss', t: t - hit } : null
  if (HOLD_TYPES.has(note.kind) && t < note.timeout) {
    const span = Math.max(1e-6, note.timeout - hit)
    return { phase: 'holding', t: t - hit, progress: clamp01((t - hit) / span) }
  }
  // hold clears start at the hold end; other notes at the press/hit
  const since = t - (HOLD_TYPES.has(note.kind) ? note.timeout : hit)
  return since <= clearDuration(grade) ? { phase: 'clear', grade, t: since } : null
}

/**
 * Triggered drag heads (chain heads only) keep sliding along their chain
 * toward the next node after being judged — Cytoid behaviour. Returns the
 * live centre, or null when the head is pre-hit or the chain has ended.
 */
export function chainFollow(
  note: ParsedNote,
  nextOf: (n: ParsedNote) => ParsedNote | null,
  t: number,
  board: BoardTransform,
): Position | null {
  const isHead = note.kind === 'drag' || note.kind === 'click_drag'
  if (!isHead || t < note.time)
    return null
  // advance to the segment the head is currently traversing
  let a: ParsedNote = note
  let b = nextOf(a)
  while (b && t >= b.time && b.next >= 0) {
    a = b
    b = nextOf(b)
  }
  if (!b || t >= b.time)
    return null // past the last node: chain done
  const α = b.time === a.time ? 1 : clamp01((t - a.time) / (b.time - a.time))
  const pa = notePos(a, a.position.y, board)
  const pb = notePos(b, b.position.y, board)
  return { x: pa.x + (pb.x - pa.x) * α, y: pa.y + (pb.y - pa.y) * α }
}

/**
 * Drag connection line for one chain link, Cytoid-timed: the leading edge
 * grows from (source intro − 0.133 s) to (destination intro − 0.132 s); the
 * trail retracts from the source hit time to the destination hit time.
 */
export function dragSegment(a: ParsedNote, b: ParsedNote, t: number, board: BoardTransform): DragSegment | null {
  const leadA = a.timein - 0.133
  const leadB = b.timein - 0.132
  const lead = leadB <= leadA ? (t >= leadB ? 1 : 0) : clamp01((t - leadA) / (leadB - leadA))
  const trailDen = b.time - a.time
  const trail = trailDen > 0 ? clamp01((t - a.time) / trailDen) : (t >= b.time ? 1 : 0)
  if (lead <= trail)
    return null
  return {
    key: `${a.id}->${b.id}`,
    from: notePos(a, dropRatio(a, t), board),
    to: notePos(b, dropRatio(b, t), board),
    lead,
    trail,
    direction: b.direction === -1 ? 'down' : 'up',
  }
}

/** Derive the complete visible frame at time `t`. */
export function deriveFrame(parsed: ParsedChart, t: number, opts: DeriveOptions): DerivedFrame {
  const { board } = opts
  const gradeOf = opts.grades ?? (() => 'perfect' as const)
  const nextOf = (n: ParsedNote) => (n.next >= 0 ? parsed.notes[n.next] ?? null : null)
  const notes: DerivedNote[] = []
  const segments: DragSegment[] = []

  // render order: later notes first (they sit *below* earlier ones, Cytoid
  // sortingOrder = (count − id) × 3), so a note sliding in never covers the
  // notes already on screen.
  for (let i = parsed.sorted.length - 1; i >= 0; i--) {
    const note = parsed.sorted[i]!
    const grade = gradeOf(note, i)
    const anchor = opts.anchorOf?.(note) ?? null
    const state = noteStateAt(note, t, grade, anchor)
    const follow = chainFollow(note, nextOf, t, board)
    if (!state && !follow)
      continue
    const pos = notePos(note, dropRatio(note, t), board)
    const next = nextOf(note)
    const target = next ? notePos(next, dropRatio(next, t), board) : null
    const heading = target && next
      ? Math.atan2(target.x - pos.x, -(target.y - pos.y))
      : 0
    notes.push({
      note,
      kind: KIND_OF[note.kind] as NoteKind,
      state,
      anchor,
      pos,
      follow,
      heading,
    })
    if (next) {
      const seg = dragSegment(note, next, t, board)
      if (seg)
        segments.push(seg)
    }
  }
  // later segments render first too (each lives in its destination's layer)
  segments.reverse()
  const page = pageAtTime(parsed.pages, t)
  return {
    notes,
    segments,
    scanline: scanlineRatio(parsed.pages, t),
    pageDirection: page?.scan_line_direction ?? 1,
  }
}

/** Drop notes approach from the opposite edge: their ratio moves fromY → y. */
function dropRatio(note: ParsedNote, t: number): number {
  const { y, fromY } = note.position
  if (note.kind !== 'drop_click' && note.kind !== 'drop_drag')
    return y
  if (t >= note.time || note.duration.fadein <= 0)
    return y
  const p = clamp01((t - note.timein) / note.duration.fadein)
  return fromY + (y - fromY) * p
}
