/**
 * Design tokens — the single source of truth for sizes, strokes, timing and
 * semantic colours. Everything else is derived from these values.
 */

/** Note kinds, mirrors Cytoid `NoteType` naming. */
export const NOTE_KINDS = [
  'click',
  'hold',
  'long-hold',
  'drag-head',
  'drag-child',
  'flick',
  'click-drag-head',
  'click-drag-child',
  'drop-click',
  'drop-drag',
] as const
export type NoteKind = typeof NOTE_KINDS[number]

/** Colour families (what the user can re-hue). Mirrors Cytoid's fill colour slots. */
export const FAMILIES = ['click', 'hold', 'long-hold', 'flick', 'drag', 'click-drag', 'drop-click', 'drop-drag'] as const
export type Family = typeof FAMILIES[number]

export const FAMILY_OF: Record<NoteKind, Family> = {
  'click': 'click',
  'hold': 'hold',
  'long-hold': 'long-hold',
  'drag-head': 'drag',
  'drag-child': 'drag',
  'flick': 'flick',
  // "same gameplay and styling as Click" — the head is a click note that starts a chain
  'click-drag-head': 'click',
  'click-drag-child': 'click-drag',
  'drop-click': 'drop-click',
  'drop-drag': 'drop-drag',
}

/** Scan direction of the page the note lives on. Cytoid picks the alt colour by it. */
export type Direction = 'up' | 'down'

export const GRADES = ['perfect', 'great', 'good', 'bad', 'miss'] as const
export type Grade = typeof GRADES[number]

export const tokens = {
  /** Click note outer diameter in design px. Every size is relative to it. */
  unit: 128,

  /**
   * Relative outer size per kind. Drag head / child are measured from *visible*
   * note bodies, not transform ratios: Cytoid renders them at 0.675 / 0.274
   * (transform 0.8 / 0.65 × sprite insets and child scales). We use Cytoid's
   * exact head size and a compromise child — head : child ≈ 1.8 : 1.
   */
  size: {
    'click': 1,
    'hold': 1,
    'long-hold': 1,
    'drag-head': 0.675,
    'drag-child': 0.375,
    'flick': 1.125,
    'click-drag-head': 1,
    'click-drag-child': 0.375,
    'drop-click': 1,
    'drop-drag': 0.8,
  } satisfies Record<NoteKind, number>,

  stroke: {
    /** main white ring, relative to unit */
    ring: 0.085,
    /**
     * Dark keyline on the ring's outer edge, as a fraction of the ring band
     * (`ringWidth`). The band is *split*, not widened — total width and the
     * outer radius stay exactly as calibrated. This is the flat answer to
     * overlapping notes: two white rings would merge; the keyline (a solid
     * dark rim) keeps a boundary.
     */
    edge: 0.34,
    /** secondary / decorative hairlines */
    hair: 0.022,
    /** hold progress ring */
    progress: 0.07,
    /** hold body width (Cytoid HoldLine: 0.56 × 1.133 world / 2.235 click ≈ 0.284) */
    holdBody: 0.284,
    /** drag connection width (Cytoid DragLine: 0.16 world / 2.235 click) */
    dragLine: 0.0716,
    /** drag connection dash and gap (Cytoid: 50 % duty, 0.16 world period) */
    dragDash: 0.0358,
  },

  /** Nominal clip durations (seconds). Normalised clips are stretched to fit the real window. */
  time: {
    /** enter (approach) clip: ends exactly at the hit time */
    enter: 1.2,
    /**
     * Exit: from the chart hit time the unjudged note steps down to
     * `drop` opacity and falls off as drop − p³ over `duration` seconds —
     * absolute time, not scaled with the approach. Starts at the hit time
     * whether or not the note has been judged; a miss rides the same timeline.
     */
    exit: { duration: 0.3, drop: 0.8 },
    /** hold press-in */
    holdPress: 0.2,
    /** hold loop period */
    holdLoop: 0.6,
    /** clear effects per grade (Cytoid FlatFX: 0.4 / speed) */
    clear: { perfect: 0.42, great: 0.46, good: 0.52, bad: 0.56, miss: 0.5 } satisfies Record<Grade, number>,
  },

  /**
   * Enter-size curves: one S-curve carries the
   * body from the small `spawn` to the overshoot `peak` (at `peakP`, synced
   * with the lead-in blink), a second S settles it back to exactly 1 — the
   * hit pose — by `settleP`. Both phases share the `s` shape (cubic-bezier
   * x1/x2), so every junction has zero velocity.
   */
  sizeCurve: {
    s: [0.7, 0.75],
    click: { spawn: 0.319, peak: 1.06, peakP: 0.878, settleP: 0.976 },
    // = click on purpose: a hold must read the same size flow as the click
    // during the approach (only its internals differ)
    hold: { spawn: 0.319, peak: 1.06, peakP: 0.878, settleP: 0.976 },
    dragHead: { spawn: 0.293, peak: 1.05, peakP: 0.766, settleP: 0.872 },
    dragChild: { spawn: 0.259, peak: 1.03, peakP: 0.766, settleP: 0.851 },
  },

  /** Judgement colours — Cytoid defaults. */
  grade: {
    perfect: '#5BC0EB',
    great: '#FDE74C',
    good: '#9BC53D',
    bad: '#E55934',
    miss: '#6B6F7A',
  } satisfies Record<Grade, string>,

  /**
   * Resting ring tone: neutral 50 (oklch 0.985 0 0). The ring is a neutral
   * material, not pure white — it spawns at neutral 400 (oklch 0.708) and
   * rises to this tone on the note's wake envelope (`ringTone` in palette.ts).
   */
  ring: '#FAFAFA',
  /**
   * Ring edge keyline (`tokens.stroke.edge`): an achromatic near-black sitting
   * between the stage (#16171D) and ink (#1C1D24) — near-invisible against the
   * stage (an isolated note's silhouette is unchanged, no added noise) and
   * crisp against the lit ring, so it only "appears" where notes overlap.
   * Constant colour, no wake of its own.
   */
  edge: '#1A1B22',
  /** neutral ink used on top of fills (glyphs) */
  ink: '#1C1D24',
  /** playground stage background */
  stage: '#16171D',

  /**
   * Default family hues (OKLCH h°) for up / down scan direction.
   * Measured from Cytoid's defaults (#35A7FF / #FF5964 / #39E59E / #F2C85A).
   */
  hue: {
    'click': { up: 247, down: 20 },
    'hold': { up: 247, down: 20 },
    'flick': { up: 247, down: 20 },
    'long-hold': { up: 88, down: 88 },
    'drag': { up: 160, down: 160 },
    // same as click by default — click drag child differs from drag child by colour only
    'click-drag': { up: 247, down: 20 },
    'drop-click': { up: 247, down: 20 },
    'drop-drag': { up: 160, down: 160 },
  } satisfies Record<Family, Record<Direction, number>>,

  /** Base chroma for fills. */
  chroma: 0.165,
} as const

export type Tokens = typeof tokens

export const KIND_LABEL: Record<NoteKind, string> = {
  'click': 'Click',
  'hold': 'Hold',
  'long-hold': 'Long hold',
  'drag-head': 'Drag head',
  'drag-child': 'Drag child',
  'flick': 'Flick',
  'click-drag-head': 'Click drag head',
  'click-drag-child': 'Click drag child',
  'drop-click': 'Drop click',
  'drop-drag': 'Drop drag',
}

export const FAMILY_LABEL: Record<Family, string> = {
  'click': 'Click',
  'hold': 'Hold',
  'long-hold': 'Long hold',
  'flick': 'Flick',
  'drag': 'Drag',
  'click-drag': 'Click drag',
  'drop-click': 'Drop click',
  'drop-drag': 'Drop drag',
}
