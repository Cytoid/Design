/**
 * Bake frame animations.
 *
 *   pnpm bake                         # → playground/public/frames (30 fps, 1x)
 *   pnpm bake --out out/frames --fps 60 --scale 2 --cylheim
 *   pnpm bake --kinds click,flick --dirs up --hue-shift 40
 *   pnpm bake --palette my-palette.json   # PaletteOptions JSON (exported from the playground)
 */
import type { NoteKind, PaletteOptions } from '../src'
import { readFile, rm } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { bake } from '../src/bake'

const { values } = parseArgs({
  options: {
    'out': { type: 'string', default: 'playground/public/frames' },
    'fps': { type: 'string', default: '30' },
    'scale': { type: 'string', default: '1' },
    'kinds': { type: 'string' },
    'dirs': { type: 'string' },
    'hue-shift': { type: 'string' },
    'palette': { type: 'string' },
    'no-frames': { type: 'boolean', default: false },
    'cylheim': { type: 'boolean', default: false },
    'clean': { type: 'boolean', default: true },
  },
})

let palette: PaletteOptions = {}
if (values.palette)
  palette = JSON.parse(await readFile(values.palette, 'utf8'))
if (values['hue-shift'])
  palette.hueShift = Number(values['hue-shift'])

if (values.clean)
  await rm(values.out!, { recursive: true, force: true })

const started = performance.now()
let count = 0
await bake({
  outDir: values.out!,
  fps: Number(values.fps),
  scale: Number(values.scale),
  kinds: values.kinds?.split(',') as NoteKind[] | undefined,
  directions: values.dirs?.split(',') as ('up' | 'down')[] | undefined,
  palette,
  frames: !values['no-frames'],
  cylheim: values.cylheim,
  onProgress: (m) => {
    count++
    process.stdout.write(`\r\x1B[2K${count} ${m}`)
  },
})
console.log(`\nBaked to ${values.out} in ${((performance.now() - started) / 1000).toFixed(1)}s`)
