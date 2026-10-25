import type { NoteKind } from '@cytoid/notes'
// Dev helper: render deliberately overlapping notes at their hit pose to
// review the ring-edge falloff (the flat overlap separator).
//   pnpm exec tsx scripts/overlap.ts
// One column per edge variant (see `variants`); `current tokens` is whatever
// `tokens.stroke.edge` holds. Writes the combined sheet plus one PNG per
// variant to .sheets/overlap*.png (2× scale).
import { mkdirSync, writeFileSync } from 'node:fs'
import { rasterizeSvg } from '@cytoid/design-tools'
import { compileSkin, parseSkin, toSVGMarkup } from '@cytoid/notes'
import { createContext, tokens } from '@cytoid/skin-flat'
import { buildFlatSkin } from './gen-skin'

const cell = 260

interface Placement { kind: NoteKind, x: number, y: number, opts?: Parameters<typeof createContext>[1] }

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

interface Variant { id: string, label: string, edge: { placement: 'inside' | 'outside', bands: { fraction: number, opacity: number }[] } }

const variants: Variant[] = [
  { id: 'none', label: 'no edge', edge: { placement: 'inside', bands: [] } },
  { id: 'a-keyline', label: '(a) keyline 0.34', edge: { placement: 'inside', bands: [{ fraction: 0.34, opacity: 1 }] } },
  { id: 'b-inside', label: '(b) 3 bands in', edge: { placement: 'inside', bands: [{ fraction: 0.1, opacity: 0.9 }, { fraction: 0.1, opacity: 0.5 }, { fraction: 0.1, opacity: 0.2 }] } },
  { id: 'c-outside', label: '(c) 3 bands out', edge: { placement: 'outside', bands: [{ fraction: 0.1, opacity: 0.9 }, { fraction: 0.1, opacity: 0.5 }, { fraction: 0.1, opacity: 0.2 }] } },
  { id: 'd-soft', label: '(d) 0.25 @ 0.5', edge: { placement: 'inside', bands: [{ fraction: 0.25, opacity: 0.5 }] } },
]

const colX = (col: number) => col * cell + cell / 2
const rowY = (row: number) => row * cell + cell / 2
const SCALE = 2

// The edge falloff is embedded in the skin document now, so each variant is a
// rebuilt skin compiled to its own designs (`buildFlatSkin(edge)`).
function column(v: Variant, col: number) {
  // the falloff colour is constant across variants (`tokens.edge`); only the shape varies
  const designs = compileSkin(parseSkin(buildFlatSkin({ color: tokens.edge, ...v.edge })))
  const cells = clusters.map((c, r) => c.notes.map((p) => {
    const ctx = createContext(p.kind, p.opts)
    const node = designs[p.kind].enter.draw(1, ctx)
    return `<g transform="translate(${colX(col) + p.x} ${rowY(r) + p.y})">${toSVGMarkup(node)}</g>`
  }).join('')).join('')
  return cells
}

const rowLabels = clusters
  .map((c, r) => `<text x="6" y="${rowY(r) - cell / 2 + 14}" fill="#666" font-size="11" font-family="monospace">${c.name}</text>`)
  .join('')
const colLabel = (v: Variant, col: number) => `<text x="${colX(col)}" y="${cell * clusters.length - 8}" text-anchor="middle" fill="#888" font-size="12" font-family="monospace">${v.label}</text>`

function sheet(cols: Variant[]) {
  const W = cell * cols.length
  const H = clusters.length * cell
  const body = cols.map((v, i) => column(v, i) + colLabel(v, i)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${tokens.stage}"/>${rowLabels}${body}</svg>`
}

function write(name: string, svg: string) {
  writeFileSync(`.sheets/${name}.svg`, svg)
  writeFileSync(`.sheets/${name}.png`, rasterizeSvg(svg, { loadSystemFonts: true }))
  console.log(`ok → .sheets/${name}.png`)
}

mkdirSync('.sheets', { recursive: true })
const current: Variant = { id: 'current', label: 'current tokens', edge: { placement: tokens.stroke.edge.placement, bands: tokens.stroke.edge.bands.map(b => ({ ...b })) } }
write('overlap', sheet([...variants, current]))
for (const v of [...variants.slice(1), current])
  write(`overlap-${v.id}`, sheet([v]))
