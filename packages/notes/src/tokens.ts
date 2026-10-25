/** Note identities and engine clocks. Visual parameters are supplied by an appearance. */

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

/** Engine clip lifetimes and slot clocks. */
export const noteTiming = {
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
  holdLoop: 1,
  /** clear effects per grade (Cytoid FlatFX: 0.4 / speed) */
  clear: { perfect: 0.42, great: 0.46, good: 0.52, bad: 0.56, miss: 0.5 } satisfies Record<Grade, number>,
} as const

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

/** Named color scales available to skins. */
export type ColorType = Family | Grade
