/** Offline glyph outlines used by the Flat skin generator. No runtime font processing. */
type Stroke = [number, number][]
interface Glyph { w: number, strokes: Stroke[], closed?: boolean[] }

const W = 0.62
const K = 0.18 // chamfer
const M = 0.82

/** Glyphs in a 1-unit-high box, y down. */
export const GLYPHS: Record<string, Glyph> = {
  'P': { w: W, strokes: [[[0, 1], [0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]]] },
  'E': { w: W, strokes: [[[W, 0], [0, 0], [0, 1], [W, 1]], [[0, 0.5], [W * 0.82, 0.5]]] },
  'R': { w: W, strokes: [[[0, 1], [0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]], [[W * 0.2, 0.5], [W * 0.42, 0.5], [W, 0.5 + W * 0.58], [W, 1]]] }, // leg: lead-in along the bowl line, 45° run, vertical foot — bare diagonal ends poke their square caps past the bowl line / baseline
  'F': { w: W, strokes: [[[W, 0], [0, 0], [0, 1]], [[0, 0.5], [W * 0.82, 0.5]]] },
  'C': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W, 1]]] },
  'T': { w: W, strokes: [[[0, 0], [W, 0]], [[W / 2, 0], [W / 2, 1]]] },
  'G': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W, 1], [W, 0.55], [W * 0.48, 0.55]]] },
  'A': { w: W, strokes: [[[0, 1], [0, K], [K, 0], [W - K, 0], [W, K], [W, 1]], [[0, 0.58], [W, 0.58]]] },
  'O': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]]], closed: [true] },
  'D': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [0, 1]]], closed: [true] },
  'B': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 0.5 - K], [W - K, 0.5], [0, 0.5]], [[W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1], [0, 0]]] },
  // chamfered top corners + a centre stem (pairs with W) — no acute V-joints
  'M': { w: M, strokes: [[[0, 1], [0, K], [K, 0], [M - K, 0], [M, K], [M, 1]], [[M / 2, 0], [M / 2, 0.6]]] },
  'I': { w: 0, strokes: [[[0, 0], [0, 1]]] },
  'S': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1]]] },
  'X': { w: W * 0.9, strokes: [[[0, 0], [W * 0.9, 1]], [[W * 0.9, 0], [0, 1]]] },
  // FAST / SLOW timing label
  'L': { w: W * 0.9, strokes: [[[0, 0], [0, 1], [W * 0.9, 1]]] },
  // M flipped: a V-joint would meet the stems at an acute angle and the miter
  // join would spike past the baseline
  'W': { w: M, strokes: [[[0, 0], [0, 1 - K], [K, 1], [M - K, 1], [M, 1 - K], [M, 0]], [[M / 2, 0.4], [M / 2, 1]]] },
  // digits — same chamfered stroke language as the letters (combo / score UI)
  '0': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]]], closed: [true] },
  '1': { w: 0.34, strokes: [[[0, 0.16], [0.17, 0], [0.17, 1]]] },
  '2': { w: W, strokes: [[[0, K], [K, 0], [W - K, 0], [W, K], [W, 0.42], [0.08, 1], [W, 1]]] },
  '3': { w: W, strokes: [[[0, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K]], [[0, 0.5], [W * 0.75, 0.5]]] },
  '4': { w: W, strokes: [[[W * 0.68, 0], [0, 0.62], [W, 0.62]], [[W * 0.68, 0], [W * 0.68, 1]]] },
  '5': { w: W, strokes: [[[W, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - K, 0.5], [W, 0.5 + K], [W, 1 - K], [W - K, 1], [0, 1]]] },
  '6': { w: W, strokes: [[[W, K], [W - K, 0], [K, 0], [0, K], [0, 1 - K], [K, 1], [W - K, 1], [W, 1 - K], [W, 0.5 + K], [W - K, 0.5], [0.06, 0.5]]] },
  '7': { w: W, strokes: [[[0, 0], [W, 0], [W * 0.38, 1]]] },
  '8': { w: W, strokes: [[[K, 0], [W - K, 0], [W, K], [W, 1 - K], [W - K, 1], [K, 1], [0, 1 - K], [0, K]], [[0, 0.5], [W, 0.5]]], closed: [true, false] },
  '9': { w: W, strokes: [[[0, 1 - K], [K, 1], [W - K, 1], [W, 1 - K], [W, K], [W - K, 0], [K, 0], [0, K], [0, 0.5 - K], [K, 0.5], [W - 0.06, 0.5]]] },
  '%': { w: 0.78, strokes: [[[0.72, 0], [0.06, 1]], [[0.02, 0.06], [0.3, 0.06], [0.3, 0.34], [0.02, 0.34]], [[0.48, 0.66], [0.76, 0.66], [0.76, 0.94], [0.48, 0.94]]], closed: [false, true, true] },
  '.': { w: 0.26, strokes: [[[0.05, 0.9], [0.21, 0.9], [0.21, 1], [0.05, 1]]], closed: [true] },
}
