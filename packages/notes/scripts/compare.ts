// Dev helper: click vs hold vs long-hold enter (with bodies) side by side.
import { writeFileSync } from 'node:fs'
import process from 'node:process'
import { Resvg } from '@resvg/resvg-js'
import { createContext, designs, holdBody, longHoldBody, tokens, toSVGMarkup } from '../src'

const cell = 170
const cols = 14
const rowsK = ['click', 'hold', 'long-hold'] as const
const out = process.argv[2] ?? '.sheets/compare.png'
const parts: string[] = []
rowsK.forEach((kind, r) => {
  const ctx = createContext(kind, { scale: 0.8 })
  for (let i = 0; i < cols; i++) {
    const p = i / (cols - 1)
    const cx = i * cell + cell / 2
    const cy = r * cell * 1.6 + cell
    const nodes = []
    if (kind === 'hold')
      nodes.push(holdBody({ length: cell * 0.9, progress: 0, appear: p }, ctx))
    if (kind === 'long-hold')
      nodes.push(longHoldBody({ top: cell * 0.8, bottom: cell * 0.5, progress: 0, appear: p }, ctx))
    nodes.push(designs[kind].enter.draw(p, ctx))
    parts.push(`<g transform="translate(${cx} ${cy})">${nodes.map(toSVGMarkup).join('')}</g>`)
    parts.push(`<text x="${i * cell + 6}" y="${r * cell * 1.6 + 14}" fill="#666" font-size="11" font-family="monospace">${kind} ${p.toFixed(2)}</text>`)
  }
})
const W = cols * cell
const H = rowsK.length * cell * 1.6
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${tokens.stage}"/>${parts.join('')}</svg>`
writeFileSync(out, new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng())
console.log(out)
