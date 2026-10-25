import type { SceneNode } from '../core/scene'
import type { NotePalette, Palette } from '../palette'
import type { Direction, Grade, NoteKind } from '../tokens'
import type { Timing } from './timing'

/** Everything a clip needs to draw one frame. */
export interface DrawContext {
  kind: NoteKind
  /** Base ring and hair widths in context pixels, before kind-specific ring adjustment. */
  ringStroke: number
  hairStroke: number
  palette: NotePalette
  grades: Record<Grade, string>
  /** Full color source for explicit named family references. */
  colors: Palette
  /** Bound by judgement slots; absent for note animation previews. */
  grade?: Grade
  /** scan direction used for colour (Cytoid `UseAlternativeColor`) */
  direction: Direction
  /** direction the hold body extends toward (may differ: storyboards, reversed pages) */
  bodyDirection: Direction
  /** chain heading for drag-head arrows, radians (0 = up, clockwise). Frames are baked at 0 — rotate the sprite. */
  heading: number
  /** real approach window in seconds (intro → hit). Used where Cytoid timing is absolute (flick lock). */
  approach: number
  /** note outer diameter in px (unit × kind size × scale) */
  size: number
  /** click note diameter in px (the global unit, scaled) */
  unit: number
}

/**
 * How the clip's parameter `x` is interpreted:
 *  - `normalized`: x ∈ [0, 1] over a window whose real length varies
 *    (enter: from note intro to hit time). Stretch to fit.
 *  - `once`: x = seconds since the clip started, plays `duration` once.
 *  - `loop`: x = seconds, seamless with period `duration`.
 *  - `progress`: x ∈ [0, 1] driven by gameplay (hold progress), not time.
 *  - `static`: a single still image (drop notes). x is ignored.
 */
export type ClipMode = 'normalized' | 'once' | 'loop' | 'progress' | 'static'

export interface Clip {
  /** Include the exact zero-time pose when baking normalized clips containing sequences. */
  includeStart?: boolean
  id: string
  mode: ClipMode
  /** nominal duration in seconds (for `progress`: suggested seconds to sample at bake fps) */
  duration: number
  draw: (x: number, ctx: DrawContext) => SceneNode
  /** short human description, shown in the playground / docs */
  note?: string
}

export type ClearGrade = Exclude<Grade, 'miss'>

export interface NoteDesign {
  kind: NoteKind
  /** approach animation, ends at hit time. x = normalised approach progress */
  enter: Clip
  /** hit effects per grade (x = seconds after judgement) */
  clear: Record<ClearGrade, Clip>
  /**
   * Miss effect (x = seconds after the miss judgement). Absent on designs with
   * an `exit`: there the exit fade *is* the miss, the judgement only adds the
   * MISS text.
   */
  miss?: Clip
  /**
   * Exit after the hit time while unjudged (x = seconds since the chart hit
   * time, absolute — not scaled with the approach). Keeps running through a
   * miss judgement, so a late miss never restarts the note at full opacity.
   */
  exit?: Clip
  /** Parametric stretched body, present on Hold and Long Hold designs. */
  body?: BodyClip
  /** hold-only layers, composed under → press → over → progress while holding */
  hold?: {
    /** head press-in when the hold starts */
    press: Clip
    /** looping layer drawn *under* the head (e.g. ripples) — sandwich the body */
    loopUnder?: Clip
    /** looping layer drawn *over* the head (e.g. socket ping, glyph) */
    loopOver?: Clip
    /** progress indicator, x = hold progress */
    progress: Clip
  }
}

/** A compiled skin, suitable for renderers, players and baking. */
export type NoteSkin = Record<NoteKind, NoteDesign>

/** Live state of a note for the composed vector renderer. */
export type NoteState
  = | { phase: 'enter', p: number }
    | { phase: 'holding', t: number, progress: number }
    /** `timing`: FAST / SLOW of the hit (shown for GREAT / GOOD / BAD only) */
    | { phase: 'clear', grade: ClearGrade, t: number, timing?: Timing }
    /** past the hit time, still unjudged; t = seconds since the chart hit time */
    | { phase: 'exit', t: number }
    /** t = seconds since the miss judgement; `since` = seconds since the chart hit time (defaults to t: judged on the beat) */
    | { phase: 'miss', t: number, since?: number }

export interface ContextOptions {
  palette?: Palette
  direction?: Direction
  /** px per design px (1 → click note = 128 px) */
  scale?: number
  /** hold body direction, defaults to `direction` */
  bodyDirection?: Direction
  /** real approach window in seconds, defaults to the nominal enter duration */
  approach?: number
  /** drag-head arrow heading in radians (0 = up, clockwise); point it at the next chain node */
  heading?: number
}

export interface RenderOptions {
  /** Override the selected appearance's note clips. */
  skin?: NoteSkin
  /** draw the judgement text (PERFECT / GREAT / …) with clear & miss effects. Default true. */
  judgement?: boolean
  /**
   * draw the FAST / SLOW timing label when the clear state carries a `timing`
   * (GREAT / GOOD / BAD only). Independent of `judgement`: stacked under the
   * judgement text when both are on, alone in the centre otherwise. Default true.
   */
  timing?: boolean
}

export interface HoldBodyOptions {
  /** Total chart hold duration in seconds; omitted for offline strips. */
  holdDuration?: number
  /** body length in px (from note centre to hold end) */
  length: number
  /** hold progress 0–1 */
  progress: number
  /** seconds — scrolls the centre dashes while holding */
  t?: number
  /** fade-in of the body (follows the head entrance) */
  appear?: number
}

export interface LongHoldBodyOptions {
  /** distance from note centre to the top of the play area */
  top: number
  /** distance from note centre to the bottom of the play area */
  bottom: number
  /** hold progress 0–1 */
  progress: number
  /** seconds since the hit — scrolls the centre dashes, drives the live collapse */
  t?: number
  /** hit → finish seconds; enables the time-anchored collapse */
  holdDuration?: number
  /** fade-in of the body (follows the head entrance) */
  appear?: number
}

export type BodyOptions = HoldBodyOptions | LongHoldBodyOptions
export interface BodyClip {
  draw: (options: BodyOptions, context: DrawContext) => SceneNode
}

export interface DragLineOptions {
  x1: number
  y1: number
  x2: number
  y2: number
  /** leading edge 0–1 (line grows from source toward destination) */
  lead?: number
  /** trailing edge 0–1 (line retracts as the scanner passes) */
  trail?: number
  opacity?: number
  /** override dash length in px (bakers round it to whole pixels for seamless tiles) */
  dash?: number
}

/** Presentation supplied by the application; player and tools never select a default skin. */
export interface NoteAppearance {
  metrics: { unit: number }
  designs: NoteSkin
  createContext: (kind: NoteKind, options?: ContextOptions) => DrawContext
  renderNote: (kind: NoteKind, state: NoteState, context?: DrawContext, options?: RenderOptions) => SceneNode
  holdBodyAlpha: (kind: NoteKind, state: NoteState, skin?: NoteSkin) => number
  holdBody: (options: HoldBodyOptions, context: DrawContext, skin?: NoteSkin) => SceneNode
  longHoldBody: (options: LongHoldBodyOptions, context: DrawContext, skin?: NoteSkin) => SceneNode
  dragLine: (options: DragLineOptions, context: DrawContext) => SceneNode | null
}
