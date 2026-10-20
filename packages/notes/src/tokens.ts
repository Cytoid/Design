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
     * Dark edge on the ring's outer silhouette — the flat answer to
     * overlapping notes: two white rings would merge; the edge keeps a
     * boundary. Instead of one solid keyline it is a stepped falloff: abutting,
     * non-overlapping bands of `tokens.edge` (widths as fractions of the ring
     * band, `ringWidth`), listed from the silhouette away, opacity falling off
     * — a shadow read without blur, filters or gradients.
     *
     * `placement`:
     *  - 'inside'  — bands eat into the ring band from its outer edge; the
     *               silhouette and outer radius stay exactly as calibrated.
     *  - 'outside' — bands sit beyond the silhouette (radius R outward): a
     *               cast-shadow halo. Near-invisible on the stage (edge ≈
     *               stage colour); `bounds` (and so bake canvases) grow by
     *               the total band width.
     */
    edge: {
      placement: 'outside' as 'inside' | 'outside',
      bands: [
        { fraction: 0.10, opacity: 0.9 },
        { fraction: 0.10, opacity: 0.5 },
        { fraction: 0.10, opacity: 0.2 },
      ] as readonly { fraction: number, opacity: number }[],
    },
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
     * Exit: from the chart hit time an unjudged note fades out as
     * A(t) = drop − fall · (t / duration)^power (clamped, 0 from `duration`) —
     * absolute seconds, not scaled with the approach. It starts at the hit
     * time whether or not the note has been judged; a miss rides the same
     * timeline. Meanwhile the enter animation plays backwards at `rewind` ×
     * its own speed (1 = the note's real approach speed, `ctx.approach`) — an
     * independent clock from the fade. 0 = hold the hit pose.
     *  tap        click / flick / drag heads: steps 1 → 0.8 at the hit (the
     *             "you're late" cue), then 0.8 − p³
     *  holdHead   no step (a hold head is still pressable): 1 − p³
     *  holdBody   gone in half the window: 0.8 · (1 − (2p)³)
     *  dragChild  linear 1 − u over 0.15 s (Cytoid's child miss threshold)
     */
    exit: {
      rewind: 1,
      tap: { duration: 0.3, drop: 0.8, fall: 1, power: 3 },
      holdHead: { duration: 0.3, drop: 1, fall: 1, power: 3 },
      holdBody: { duration: 0.15, drop: 0.8, fall: 0.8, power: 3 },
      dragChild: { duration: 0.15, drop: 1, fall: 1, power: 1 },
    },
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
    // one smooth ease (cubic-bezier x1/x2, y 0→1) from `spawn` straight to
    // the hit size — no +6 % overshoot (a hold carries no timing gauge) and
    // no mid-way stall: a long ease-out tail keeps it gently growing late,
    // landing together with the lock brackets ≈ 4 frames before the hit
    hold: { spawn: 0.34, ease: [0.75, 0.3] },
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
