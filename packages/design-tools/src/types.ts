import type { DrawContext, NoteAppearance, Palette, PaletteOptions } from '@cytoid/notes'

/** Design data required by offline exports, provided explicitly by the caller. */
export interface BakeAppearance extends NoteAppearance {
  metrics: { unit: number, stroke: { holdBody: number, dragLine: number, dragDash: number } }
  createPalette: (options?: PaletteOptions) => Palette
  holdDashPeriod: (context: DrawContext) => number
}
