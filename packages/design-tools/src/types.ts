import type { Clip, DrawContext, Grade, NoteAppearance, Palette, PaletteOptions, TimedGrade, Timing, TimingSlot } from '@cytoid/notes'

/** Design data required by offline exports, provided explicitly by the caller. */
export interface BakeAppearance extends NoteAppearance {
  metrics: { unit: number, stroke: { holdBody: number, dragLine: number, dragDash: number } }
  createPalette: (options?: PaletteOptions) => Palette
  judgementClips: Record<Grade, Clip>
  timingClips: Record<TimedGrade, Record<Timing, Clip>>
  judgementCapHeight: (context: DrawContext) => number
  timingCapHeight: (context: DrawContext, slot: TimingSlot) => number
  timingOffset: (context: DrawContext, slot: TimingSlot) => { x: number, y: number }
  holdDashPeriod: (context: DrawContext) => number
}
