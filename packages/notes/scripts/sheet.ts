// Dev helper: render a contact sheet of every clip to PNG for quick visual review.
import { mkdirSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { Resvg } from '@resvg/resvg-js'
import { clipsOf, createContext, designs, NOTE_KINDS, tokens, toSVGMarkup } from '../src'

const cell = 230
const cols = 12
const kinds = process.argv[2] ? process.argv[2].split(',') : NOTE_KINDS
const dir = (process.argv[3] ?? 'up') as 'up' | 'down'
mkdirSync('.sheets', { recursive: true })
for (const kind of kinds as typeof NOTE_KINDS[number][]) {
  const d = designs[kind]
  const ctx = createContext(kind, { direction: dir })
  const rows: string[] = []
  const clips = clipsOf(d)
  clips.forEach((clip, r) => {
    for (let i = 0; i < cols; i++) {
      const x = clip.mode === 'normalized' || clip.mode === 'progress' ? i / (cols - 1) : (i / (cols - 1)) * clip.duration
      const node = clip.draw(x, ctx)
      rows.push(`<g transform="translate(${i * cell + cell / 2} ${r * cell + cell / 2})">${toSVGMarkup(node)}</g>`)
      rows.push(`<text x="${i * cell + 6}" y="${r * cell + 14}" fill="#666" font-size="11" font-family="monospace">${clip.id} ${x.toFixed(2)}</text>`)
    }
  })
  const W = cols * cell
  const H = clips.length * cell
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${tokens.stage}"/>${rows.join('')}</svg>`
  const png = new Resvg(svg, { font: { loadSystemFonts: true } }).render().asPng()
  writeFileSync(`.sheets/${kind}-${dir}.png`, png)
}
console.log('ok')
