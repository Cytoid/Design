/**
 * DROP notes — horizontal capsules (falling-note mode), ported from Cytoid's
 * Classic sprite design: a solid ring-colour body capsule with the fill
 * capsule stacked on top, plus the click's white core bar, at the sprites'
 * measured proportions. The one kept flat device is the dark keyline on the
 * capsule's outer edge (the flat overlap separator). The fall offset is
 * applied by the consumer (position); the note itself is a static image
 * (no enter animation), as in Cytoid.
 *
 * Drop click: ring-colour capsule + fill capsule + white core bar.
 * Drop drag: same build, shorter and squatter, no core — the classic sprites
 *   carry no drag marker (the 0.8 kind size is the only cue). Drop drags are
 *   never connected.
 */
import type { DrawContext, NoteDesign, SceneNode } from '@cytoid/notes'

import { group } from '@cytoid/notes'
import { tokens } from '@cytoid/skin-flat'
import { ringWidth } from './click'
import { makeClearClips, makeMissClip } from './effects'
import { capsule, edgeBands, ringEdge } from './parts'

/** The classic core bar is pure white, not palette-driven (Cytoid: Color.white). */
const CORE = '#FFFFFF'

/**
 * Outer capsule silhouette, from the classic sprites' 50 %-alpha contour at
 * PPU = canvas width (Note-DropClick-Ring.png 536 × 76.8, Note-DropDrag-Ring.png
 * 404 × 76.8): full `ctx.size` wide, the sprite's height fraction tall. The
 * edges are a sharp 1 px AA ramp; stray alpha ≈ 1 pixels sit ~2.5 px outside
 * it, so an alpha > 0 bounding box overstates every layer — measure at 50 %.
 */
export const DROP_CLICK_CAPSULE = { w: 1, h: 76.8 / 536 }
export const DROP_DRAG_CAPSULE = { w: 1, h: 76.8 / 404 }

interface ClassicSpec {
  capsule: { w: number, h: number }
  /** fill capsule, as fractions of the body capsule (50 %-alpha contour again) */
  fill: { w: number, h: number }
  core?: { w: number, h: number }
}

const CLICK: ClassicSpec = {
  capsule: DROP_CLICK_CAPSULE,
  fill: { w: 360.8 / 536, h: 68.8 / 76.8 },
  core: { w: 144.8 / 536, h: 32.8 / 76.8 },
}
const DRAG: ClassicSpec = {
  capsule: DROP_DRAG_CAPSULE,
  fill: { w: 244.8 / 404, h: 60.8 / 76.8 },
}

/** Static pose — drop notes are a still image, as in Cytoid. */
function dropStatic(spec: ClassicSpec) {
  return (_x: number, ctx: DrawContext): SceneNode => {
    const w = ctx.size * spec.capsule.w
    const h = ctx.size * spec.capsule.h
    // Stepped edge (`edgeBands`): a band whose centreline sits `offset` from
    // the silhouette is the capsule grown by 2·offset (rx = h/2 keeps it
    // parallel). Inside bands eat the ring-colour body's rim; outside bands
    // halo the silhouette.
    const edge = ringEdge()
    const items: SceneNode[] = [
      capsule(w, h, { fill: ctx.palette.ring }),
      capsule(w * spec.fill.w, h * spec.fill.h, { fill: ctx.palette[400] }),
      ...edgeBands(ringWidth(ctx), edge).map(b => capsule(w + 2 * b.offset, h + 2 * b.offset, { stroke: edge.color, strokeWidth: b.width, opacity: b.opacity })),
    ]
    if (spec.core)
      items.push(capsule(w * spec.core.w, h * spec.core.h, { fill: CORE }))
    return group(items)
  }
}

export const dropClick: NoteDesign = {
  kind: 'drop-click',
  enter: { id: 'enter', mode: 'static', duration: tokens.time.enter, draw: dropStatic(CLICK), note: 'Static image: classic capsule — ring body, fill, white core. Only its position moves (fall).' },
  clear: makeClearClips({ shape: 'capsule', capsule: DROP_CLICK_CAPSULE, reach: 1.3, sectors: 24, seed: 8 }),
  miss: makeMissClip('capsule', DROP_CLICK_CAPSULE),
}

export const dropDrag: NoteDesign = {
  kind: 'drop-drag',
  enter: { id: 'enter', mode: 'static', duration: tokens.time.enter, draw: dropStatic(DRAG), note: 'Static image: shorter classic capsule, ring body + fill, no core.' },
  clear: makeClearClips({ shape: 'capsule', capsule: DROP_DRAG_CAPSULE, reach: 1.3, sectors: 24, seed: 9 }),
  miss: makeMissClip('capsule', DROP_DRAG_CAPSULE),
}
