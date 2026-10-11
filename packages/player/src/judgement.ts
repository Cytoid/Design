/**
 * Input judgement — a port of Cytoid's play logic to the derived-frame
 * player. Pure state machine over (parsed chart, pointer events, time); the
 * stage consumes it as a `grades` function.
 *
 * - Clicks / holds / drag heads / drops judge on press.
 * - Flicks judge on swipe (pointer travelling ≥ SWIPE_MIN px); a plain tap
 *   on a flick whiffs. Direction is not checked (v2, Cytoid accepts any).
 * - Hold bodies / clear effects can key off `anchorOf` (the actual press
 *   time) instead of chart time.
 */
import type { Grade } from '@cytoid/notes'
import type { ParsedChart, ParsedNote } from './chart'
import { DRAG_TYPES } from './chart'

export interface JudgeWindows {
  perfect: number
  great: number
  good: number
  bad: number
}

/** Half-widths in seconds (Cytoid-like defaults — tune in one place). */
export const JUDGE_WINDOWS: JudgeWindows = { perfect: 0.05, great: 0.1, good: 0.15, bad: 0.2 }

/** Minimum travel (px) for a pointer move to count as a swipe. */
export const SWIPE_MIN = 36

export type HitGrade = Exclude<Grade, 'miss'>

/** `'pending'` = not judged yet; the note waits at its hit pose. */
export type JudgeGrade = Grade | 'pending'

interface Status {
  grade: Grade | null
  /** press pointer while a hold / click-drag chain is active */
  pointer: number | null
  /** head triggered (drag chains / holds) */
  triggered: boolean
}

interface PointerTrace {
  x: number
  y: number
  /** swipe origin (reset after each successful flick so one long drag can hit several) */
  startX: number
  startY: number
}

export interface JudgeOptions {
  windows?: JudgeWindows
  /** hit radius in board px; presses beyond ×1.6 of it whiff */
  radiusPx: number
  /** board size for x/y hit tests */
  board: { width: number, height: number }
}

export interface JudgeStats {
  combo: number
  maxCombo: number
  perfect: number
  great: number
  good: number
  bad: number
  miss: number
  judged: number
}

export class JudgeEngine {
  private statuses = new Map<number, Status>()
  private windows: JudgeWindows
  private radiusPx: number
  private board: { width: number, height: number }
  private byId = new Map<number, ParsedNote>()
  private pointers = new Map<number, PointerTrace>()
  /** actual press/release time per judged note (anchor for effects) */
  private anchors = new Map<number, number>()
  private stats: JudgeStats = { combo: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, judged: 0 }

  constructor(private parsed: ParsedChart, opts: JudgeOptions) {
    this.windows = opts.windows ?? JUDGE_WINDOWS
    this.radiusPx = opts.radiusPx
    this.board = opts.board
    for (const n of parsed.notes) {
      this.byId.set(n.id, n)
      this.statuses.set(n.id, { grade: null, pointer: null, triggered: false })
    }
  }

  /** Update the hit-test board (call on resize). */
  setBoard(board: { width: number, height: number }) {
    this.board = board
  }

  /** Update the hit radius (call when the note scale changes). */
  setRadius(radiusPx: number) {
    this.radiusPx = radiusPx
  }

  /** Grade for the stage renderer — `'pending'` keeps the note at its hit pose. */
  gradeOf = (note: ParsedNote): JudgeGrade => {
    const s = this.statuses.get(note.id)
    if (!s)
      return 'miss'
    if (s.grade)
      return s.grade
    if (this.isAutoChild(note))
      return 'perfect'
    return 'pending'
  }

  /** Actual press time of a judged note (null while pending) — hold bodies / effects anchor here. */
  anchorOf = (note: ParsedNote): number | null => {
    return this.anchors.get(note.id) ?? null
  }

  private assign(id: number, grade: Grade, t: number) {
    const s = this.statuses.get(id)!
    s.grade = grade
    this.anchors.set(id, t)
    this.stats.judged++
    this.stats[grade]++
    if (grade === 'miss' || grade === 'bad')
      this.stats.combo = 0
    else
      this.stats.combo++
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo)
  }

  /** Notes a press can possibly hit right now, nearest first (flicks need swipes). */
  private tapCandidates(x: number, y: number, t: number): ParsedNote[] {
    const { bad } = this.windows
    const out: { n: ParsedNote, dt: number, dist: number }[] = []
    for (const note of this.parsed.notes) {
      if (note.kind === 'flick')
        continue
      const s = this.statuses.get(note.id)!
      if (s.grade || s.triggered || this.isAutoChild(note))
        continue
      const dt = Math.abs(t - note.time)
      if (dt > bad)
        continue
      const dist = this.distTo(note, x, y)
      if (dist > this.radiusPx * 1.6)
        continue
      out.push({ n: note, dt, dist })
    }
    out.sort((a, b) => (a.dt - b.dt) || (a.dist - b.dist))
    return out.map(o => o.n)
  }

  /** Flicks a swipe can clear right now, nearest first. */
  private flickCandidates(x: number, y: number, t: number): ParsedNote[] {
    const { bad } = this.windows
    const out: { n: ParsedNote, dt: number, dist: number }[] = []
    for (const note of this.parsed.notes) {
      if (note.kind !== 'flick')
        continue
      const s = this.statuses.get(note.id)!
      if (s.grade)
        continue
      const dt = Math.abs(t - note.time)
      if (dt > bad)
        continue
      const dist = this.distTo(note, x, y)
      if (dist > this.radiusPx * 1.6)
        continue
      out.push({ n: note, dt, dist })
    }
    out.sort((a, b) => (a.dt - b.dt) || (a.dist - b.dist))
    return out.map(o => o.n)
  }

  private distTo(note: ParsedNote, x: number, y: number): number {
    const nx = note.position.x * this.board.width
    const ny = (1 - note.position.y) * this.board.height
    return Math.hypot(x - nx, y - ny)
  }

  /** Press: judge the nearest tappable note; returns its id or null. */
  press(x: number, y: number, t: number, pointerId: number): number | null {
    this.pointers.set(pointerId, { x, y, startX: x, startY: y })
    const nearest = this.tapCandidates(x, y, t)[0]
    if (!nearest)
      return null
    const dt = Math.abs(t - nearest.time)
    this.assign(nearest.id, dt <= this.windows.perfect
      ? 'perfect'
      : dt <= this.windows.great ? 'great' : dt <= this.windows.good ? 'good' : 'bad', t)
    const s = this.statuses.get(nearest.id)!
    s.pointer = pointerId
    s.triggered = true
    return nearest.id
  }

  /**
   * Pointer move: update the trace; once travel ≥ SWIPE_MIN, try to clear a
   * flick. The swipe origin resets after each hit so a long drag can chain.
   */
  move(x: number, y: number, t: number, pointerId: number): number | null {
    const p = this.pointers.get(pointerId)
    if (!p)
      return null
    p.x = x
    p.y = y
    if (Math.hypot(x - p.startX, y - p.startY) < SWIPE_MIN)
      return null
    const flick = this.flickCandidates(x, y, t)[0]
    if (!flick)
      return null
    const dt = Math.abs(t - flick.time)
    this.assign(flick.id, dt <= this.windows.perfect
      ? 'perfect'
      : dt <= this.windows.great ? 'great' : dt <= this.windows.good ? 'good' : 'bad', t)
    p.startX = x
    p.startY = y
    return flick.id
  }

  /** Release: breaks active holds / click-drag chains held by this pointer. */
  release(t: number, pointerId: number) {
    this.pointers.delete(pointerId)
    for (const [id, s] of this.statuses) {
      if (s.pointer !== pointerId)
        continue
      s.pointer = null
      const note = this.byId.get(id)!
      if (note.kind === 'hold' && t < note.timeout) {
        this.assign(id, 'miss', t) // lifted early: the hold fails
      }
      if (note.kind === 'click_drag') {
        // children that have not passed yet can no longer clear
        for (let cur = note.next; cur >= 0; cur = this.byId.get(cur)!.next) {
          const cs = this.statuses.get(cur)!
          if (!cs.grade)
            this.assign(cur, 'miss', t)
        }
      }
    }
  }

  /** End-of-play sweep: everything still pending counts as missed. */
  finalize(t: number) {
    for (const [id, s] of this.statuses) {
      if (s.grade)
        continue
      this.assign(id, 'miss', t)
    }
  }

  /** Chain heads (not children) — children are judged by chain state. */
  private isAutoChild(note: ParsedNote): boolean {
    if (!DRAG_TYPES.has(note.kind) || note.kind === 'drag' || note.kind === 'click_drag')
      return false
    const head = this.byId.get(note.head >= 0 ? note.head : note.id)
    if (!head)
      return false
    const hs = this.statuses.get(head.id)!
    if (!hs.triggered || hs.grade === 'miss')
      return false
    if (note.kind === 'cdrag_child' && (hs.pointer == null))
      return false // click-drag requires the press to still be held
    return true
  }

  /** Progress a frame: auto-children clear on pass, deadlines turn into misses. */
  update(t: number) {
    const { bad } = this.windows
    for (const note of this.parsed.notes) {
      const s = this.statuses.get(note.id)!
      if (s.grade)
        continue
      if (this.isAutoChild(note)) {
        if (t >= note.time) {
          this.assign(note.id, 'perfect', Math.max(t, note.time))
          s.triggered = true
        }
        continue
      }
      if (this.autoChildFailed(note)) {
        this.assign(note.id, 'miss', t)
        continue
      }
      // pressables (incl. flicks): miss once the hit window has passed
      if (t > note.time + bad)
        this.assign(note.id, 'miss', Math.max(t, note.time + bad))
    }
  }

  /** Children whose chain can no longer clear them. */
  private autoChildFailed(note: ParsedNote): boolean {
    if (!DRAG_TYPES.has(note.kind) || note.kind === 'drag' || note.kind === 'click_drag')
      return false
    const head = this.byId.get(note.head >= 0 ? note.head : note.id)
    if (!head)
      return true
    const hs = this.statuses.get(head.id)!
    if (hs.grade === 'miss')
      return true // head missed → chain dead
    if (!hs.triggered)
      return false // head still pressable within its window
    if (note.kind === 'cdrag_child' && hs.pointer == null)
      return true
    return false
  }

  /** Live tally. */
  score(): JudgeStats {
    return { ...this.stats }
  }
}

/**
 * Autoplay tally — every note perfect at its timeout (core semantics: combo
 * increments when the hold completes, not when the head is hit), or honours
 * a custom grade function (mixed-grade previews).
 */
export function autoplayStats(
  parsed: ParsedChart,
  t: number,
  gradeOf: (note: ParsedNote, index: number) => Grade = () => 'perfect',
): JudgeStats {
  const stats: JudgeStats = { combo: 0, maxCombo: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, judged: 0 }
  for (let i = 0; i < parsed.sorted.length; i++) {
    const note = parsed.sorted[i]!
    if (note.timeout > t)
      break
    const g = gradeOf(note, i)
    stats[g]++
    stats.judged++
    if (g === 'miss' || g === 'bad')
      stats.combo = 0
    else
      stats.combo++
    stats.maxCombo = Math.max(stats.maxCombo, stats.combo)
  }
  return stats
}
