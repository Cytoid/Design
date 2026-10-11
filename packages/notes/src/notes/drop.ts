/**
 * DROP notes — horizontal capsules (falling-note mode). The fall offset is
 * applied by the consumer (position); the note itself is a static image
 * (no enter animation), as in Cytoid.
 *
 * Drop click: white outline + fill + white core bar.
 * Drop drag: shorter, outline + fill, no core; two notches mark it as a drag.
 *   Drop drags are never connected.
 */
import type { SceneNode } from '../core/scene'
import type { DrawContext, NoteDesign } from './types'
import { group } from '../core/scene'
import { tokens } from '../tokens'
import { makeClearClips, makeMissClip } from './effects'
import { capsule } from './parts'

export const DROP_ASPECT = { w: 1.15, h: 0.3 }

/** Static pose — drop notes are a still image, as in Cytoid. */
function dropStatic(core: boolean) {
  return (_x: number, ctx: DrawContext): SceneNode => {
    const w = ctx.size * DROP_ASPECT.w
    const h = ctx.size * DROP_ASPECT.h
    const W = h * 0.2
    // dark keyline on the ring's outer edge (flat overlap separator): the
    // capsule path is grown by (W−e) so its outer boundary — the capsule's
    // silhouette — is unchanged, and the white band stays W−e visible
    const e = W * tokens.stroke.edge
    const items: SceneNode[] = [
      capsule(w - W, h - W, { fill: ctx.palette[400] }),
      capsule(w - W / 2, h - W / 2, { stroke: ctx.palette.ring, strokeWidth: W }),
      capsule(w - W / 2 + (W - e), h - W / 2 + (W - e), { stroke: tokens.edge, strokeWidth: e }),
    ]
    if (core) {
      items.push(capsule(w * 0.5, h * 0.26, { fill: ctx.palette.ring }))
    }
    else {
      const nh = h * 0.42
      for (const s of [-1, 1]) {
        const x = s * w * 0.16
        items.push({ type: 'line', x1: x, y1: -nh / 2, x2: x, y2: nh / 2, stroke: ctx.palette[600], strokeWidth: W * 0.9, cap: 'round' })
      }
    }
    return group(items)
  }
}

export const dropClick: NoteDesign = {
  kind: 'drop-click',
  enter: { id: 'enter', mode: 'static', duration: tokens.time.enter, draw: dropStatic(true), note: 'Static image: capsule + white core. Only its position moves (fall).' },
  clear: makeClearClips({ shape: 'capsule', reach: 1.3, sectors: 24, seed: 8 }),
  miss: makeMissClip('capsule'),
}

export const dropDrag: NoteDesign = {
  kind: 'drop-drag',
  enter: { id: 'enter', mode: 'static', duration: tokens.time.enter, draw: dropStatic(false), note: 'Static image: shorter capsule, two notches instead of a core.' },
  clear: makeClearClips({ shape: 'capsule', reach: 1.3, sectors: 24, seed: 9 }),
  miss: makeMissClip('capsule'),
}
