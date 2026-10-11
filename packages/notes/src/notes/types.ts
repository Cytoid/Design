import type { SceneNode } from '../core/scene'
import type { NotePalette } from '../palette'
import type { Direction, Grade, NoteKind } from '../tokens'

/** Everything a clip needs to draw one frame. */
export interface DrawContext {
  kind: NoteKind
  palette: NotePalette
  grades: Record<Grade, string>
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
  miss: Clip
  /** hold-only layers */
  hold?: {
    /** head press-in when the hold starts */
    press: Clip
    /** looping decoration while holding */
    loop: Clip
    /** progress indicator, x = hold progress */
    progress: Clip
  }
}

/** Live state of a note for the composed vector renderer. */
export type NoteState
  = | { phase: 'enter', p: number }
    | { phase: 'holding', t: number, progress: number }
    | { phase: 'clear', grade: ClearGrade, t: number }
    | { phase: 'miss', t: number }
