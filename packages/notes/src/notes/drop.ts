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
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { group } from '../core/scene'
import { tokens } from '../tokens'
import { ringWidth } from './click'
import { makeClearClips, makeMissClip } from './effects'
import { capsule } from './parts'

/** The classic core bar is pure white, not palette-driven (Cytoid: Color.white). */
const CORE = '#FFFFFF'

/**
 * Outer capsule silhouette, from the classic sprites' alpha bounds at
 * PPU = canvas width (Note-DropClick-Ring.png 536×82, Note-DropDrag-Ring.png
 * 404×82): full `ctx.size` wide, the sprite's height fraction tall.
 */
export const DROP_CLICK_CAPSULE = { w: 1, h: 82 / 536 }
export const DROP_DRAG_CAPSULE = { w: 1, h: 82 / 404 }

interface ClassicSpec {
  capsule: { w: number, h: number }
  /** fill capsule, as fractions of the body capsule (alpha bounds again) */
  fill: { w: number, h: number }
  core?: { w: number, h: number }
}

const CLICK: ClassicSpec = {
  capsule: DROP_CLICK_CAPSULE,
  fill: { w: 366 / 536, h: 74 / 82 },
  core: { w: 150 / 536, h: 38 / 82 },
}
const DRAG: ClassicSpec = {
  capsule: DROP_DRAG_CAPSULE,
  fill: { w: 250 / 404, h: 66 / 82 },
}

/** Static pose — drop notes are a still image, as in Cytoid. */
function dropStatic(spec: ClassicSpec) {
  return (_x: number, ctx: DrawContext): SceneNode => {
    const w = ctx.size * spec.capsule.w
    const h = ctx.size * spec.capsule.h
    // Keyline path inset by e so the stroke's outer edge lands on the
    // capsule silhouette: the ring-colour body's outer e becomes the rim.
    const e = ringWidth(ctx) * tokens.stroke.edge
    const items: SceneNode[] = [
      capsule(w, h, { fill: ctx.palette.ring }),
      capsule(w * spec.fill.w, h * spec.fill.h, { fill: ctx.palette[400] }),
      capsule(w - e, h - e, { stroke: tokens.edge, strokeWidth: e }),
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
