import type { NoteKind } from '../src'
// Dev helper: render deliberately overlapping notes at their hit pose to
// review the ring-edge keyline (the flat overlap separator).
//   pnpm exec tsx scripts/overlap.ts
// Left column = keyline off (the old look), right column = current tokens.
import { mkdirSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'
import { createContext, designs, tokens, toSVGMarkup } from '../src'

const cell = 260

interface Placement { kind: NoteKind, x: number, y: number, opts?: Parameters<typeof createContext>[1] }

/** One note at its hit pose, centred on (x, y). */
function note(p: Placement, x: number, y: number) {
  const ctx = createContext(p.kind, p.opts)
  const node = designs[p.kind].enter.draw(1, ctx)
  return `<g transform="translate(${x} ${y})">${toSVGMarkup(node)}</g>`
}

/** Overlap clusters (hit poses), centred inside each cell. */
const clusters: { name: string, notes: Placement[] }[] = [
  {
    name: 'click + click',
    notes: [
      { kind: 'click', x: -30, y: -18 },
      { kind: 'click', x: 30, y: 18 },
    ],
  },
  {
    name: 'click over hold',
    notes: [
      { kind: 'hold', x: -38, y: 24 },
      { kind: 'click', x: 26, y: -20 },
    ],
  },
  {
    name: 'drag chain (head + children)',
    notes: [
      { kind: 'drag-head', x: 0, y: -46, opts: { heading: Math.PI / 2 } },
      { kind: 'drag-child', x: 0, y: 2 },
      { kind: 'drag-child', x: 0, y: 40 },
      { kind: 'drag-child', x: 0, y: 74 },
    ],
  },
  {
    name: 'flick over click',
    notes: [
      { kind: 'flick', x: -26, y: -14 },
      { kind: 'click', x: 30, y: 22 },
    ],
  },
  {
    name: 'drop click + drop drag',
    notes: [
      { kind: 'drop-click', x: 0, y: -16 },
      { kind: 'drop-drag', x: 0, y: 16 },
    ],
  },
  {
    name: 'dense page (3 clicks)',
    notes: [
      { kind: 'click', x: -42, y: -26 },
      { kind: 'click', x: 0, y: 0 },
      { kind: 'click', x: 42, y: 26 },
    ],
  },
]

const colX = (col: number) => col * cell + cell / 2
const rowY = (row: number) => row * cell + cell / 2

// Two passes: the designs read tokens at draw time, so render the "old look"
// with the keyline fraction zeroed first, then restore and render current.
const saved = tokens.stroke.edge
;(tokens.stroke as { edge: number }).edge = 0
const oldCells = clusters.map((c, r) => c.notes.map(n => note(n, colX(0) + n.x, rowY(r) + n.y)).join(''))
;(tokens.stroke as { edge: number }).edge = saved
const newCells = clusters.map((c, r) => c.notes.map(n => note(n, colX(1) + n.x, rowY(r) + n.y)).join(''))
const cells = clusters.map((_, r) => oldCells[r]! + newCells[r]!).join('')

const labels = `${clusters
  .map((c, r) => `<text x="6" y="${rowY(r) - cell / 2 + 14}" fill="#666" font-size="11" font-family="monospace">${c.name}</text>`)
  .join('')
}<text x="${colX(0) - 46}" y="14" fill="#888" font-size="11" font-family="monospace">no keyline</text>`
+ `<text x="${colX(1) - 62}" y="14" fill="#888" font-size="11" font-family="monospace">edge keyline</text>`

const W = cell * 2
const H = clusters.length * cell
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${tokens.stage}"/>${labels}${cells}</svg>`

mkdirSync('.sheets', { recursive: true })
writeFileSync('.sheets/overlap.svg', svg)
writeFileSync('.sheets/overlap.png', new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng())
console.log('ok → .sheets/overlap.png')
