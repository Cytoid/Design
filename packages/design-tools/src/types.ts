import type { ChainLinkOptions, DrawContext, NoteAppearance, Palette, PaletteOptions } from '@cytoid/notes'

/** Design data required by offline exports, provided explicitly by the caller. */
export interface BakeAppearance extends NoteAppearance {
  /**
   * Flat-calibrated strip geometry: the native renderer tiles chains/bodies
   *  at these periods, so skins must stay periodic over them (see the body
   *  strip notes in the manifest).
   */
  metrics: { unit: number, stroke: { holdBody: number, dragLine: number, dragDash: number } }
  createPalette: (options?: PaletteOptions) => Palette
  holdDashPeriod: (context: DrawContext) => number
}
export type { ChainLinkOptions }
