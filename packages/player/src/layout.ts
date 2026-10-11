/**
 * Play-area layout — two-stage port of the core player's geometry:
 *
 * 1. `setSize`: viewport aspect clamped between 4:3 and 22:9 → the player
 *    box, centred (letterbox margins on the excess axis).
 * 2. `#player` / `#note-box` CSS custom properties: the note field sits
 *    inside the player box with fixed ratios —
 *      innerWidth  = 0.82 × W          (9% inset each side)
 *      padding-top = 0.0966666 × W     (top > bottom: board sits low)
 *      padding-bottom = 0.07 × W
 *      innerHeight = H − (padding-top + padding-bottom)
 *
 * All ratios are relative to the clamped player *width*, exactly like the
 * CSS calc() chain (they cancel to `--topRatio × width` etc.).
 */
export interface BoardRect {
  x: number
  y: number
  width: number
  height: number
}

/** Core click-note parity: full note diameter ≈ 0.41 × play-area height. */
export const NOTE_HEIGHT_RATIO = 0.412

const MIN_RATIO = 4 / 3
const MAX_RATIO = 22 / 9
const SIDE_RATIO = 0.09 // (1 − 0.82) / 2
const INNER_RATIO = 0.82
const TOP_RATIO = 0.0966666
const BOTTOM_RATIO = 0.07

/** Stage 1: aspect-clamped player box, centred in the viewport. */
export function layoutPlayer(vw: number, vh: number): BoardRect {
  let w = vw
  let h = vh
  const ratio = vw / vh
  if (ratio < MIN_RATIO) {
    h = (w * 3) / 4
  }
  else if (ratio > MAX_RATIO) {
    w = (h * 22) / 9
  }
  return { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h }
}

/** Full layout: the note field inside the viewport, in viewport px. */
export function layoutBoard(vw: number, vh: number): BoardRect {
  const p = layoutPlayer(vw, vh)
  const innerWidth = p.width * INNER_RATIO
  const paddingTop = p.width * TOP_RATIO
  const paddingBottom = p.width * BOTTOM_RATIO
  const innerHeight = p.height - paddingTop - paddingBottom
  return {
    x: p.x + p.width * SIDE_RATIO,
    y: p.y + paddingTop,
    width: innerWidth,
    height: innerHeight,
  }
}
