import type { Buffer } from 'node:buffer'
/**
 * Frame-animation baker (Node only). Rasterises the vector designs with
 * resvg into PNG sequences + per-clip sprite sheets + a JSON manifest.
 */
import type { SceneNode } from '../core/scene'
import type { Clip, DrawContext } from '../notes/types'
import type { Palette, PaletteOptions } from '../palette'
import type { Direction, Grade, NoteKind } from '../tokens'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import { bounds, group } from '../core/scene'
import { clipsOf, createContext, designs, dragLine, holdBody, holdDashPeriod, holdEndLength, judgementCapHeight, judgementClips, longHoldBody } from '../notes'
import { createPalette, exportPalette } from '../palette'
import { toSVGMarkup } from '../render/svg'
import { GRADES, NOTE_KINDS, tokens } from '../tokens'
import { CYLHEIM_PX_PER_UNIT, CYLHEIM_TARGETS, cylheimSamples } from './cylheim'
import { sampleTimes } from './sample'

export interface BakeOptions {
  outDir: string
  /** frames per second (Cylheim plays 30) */
  fps?: number
  /** px per design px. 1 → click note = 128 px */
  scale?: number
  kinds?: readonly NoteKind[]
  directions?: readonly Direction[]
  palette?: PaletteOptions
  /** frames for progress clips */
  progressFrames?: number
  /** write individual PNG frames (sheets are always written) */
  frames?: boolean
  /** also write a Cylheim-named compat folder */
  cylheim?: boolean
  onProgress?: (msg: string) => void
}

export interface ClipManifest {
  mode: Clip['mode']
  duration: number
  frames: number
  width: number
  height: number
  /** pivot in texture space (0..1), always the note centre */
  anchor: [number, number]
  /** file pattern, `{i}` = 5-digit zero-padded frame index */
  files?: string
  sheet: { file: string, cols: number, rows: number }
  sampling: string
}

export interface FrameManifest {
  format: 'cytoid-notes/frames@1'
  fps: number
  scale: number
  unit: number
  /** px per design unit — divide texture size by this to get size relative to a click note */
  pxPerUnit: number
  palette: ReturnType<typeof exportPalette>
  notes: Partial<Record<NoteKind, Partial<Record<Direction, Record<string, ClipManifest>>>>>
  /**
   * Judgement text per grade, shared by all kinds. Textures are centred on the
   * text; place the text centre on the note centre (it sits inside the effect).
   */
  judgement: Partial<Record<Grade, ClipManifest>> & { capHeight?: number, placement?: string }
  bodies: Partial<Record<Direction, Record<string, { file: string, width: number, height: number, repeat: 'y' | 'none', note: string }>>>
}

const pad = (i: number) => String(i).padStart(5, '0')

export function rasterize(node: SceneNode, w: number, h: number, ox: number, oy: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${ox} ${oy})">${toSVGMarkup(node)}</g></svg>`
  return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng()
}

/** Symmetric canvas around the origin that fits every frame. */
function canvasFor(nodes: SceneNode[], padPx = 3): { w: number, h: number } {
  let hx = 1
  let hy = 1
  for (const n of nodes) {
    const b = bounds(n)
    if (!b)
      continue
    hx = Math.max(hx, -b[0], b[2])
    hy = Math.max(hy, -b[1], b[3])
  }
  const even = (v: number) => Math.ceil(v + padPx) * 2
  return { w: even(hx), h: even(hy) }
}

async function bakeClip(clip: Clip, ctx: DrawContext, dir: string, rel: string, o: Required<Pick<BakeOptions, 'fps' | 'progressFrames' | 'frames'>>): Promise<ClipManifest> {
  const xs = sampleTimes(clip, o.fps, o.progressFrames)
  const nodes = xs.map(x => clip.draw(x, ctx))
  const { w, h } = canvasFor(nodes)
  await mkdir(join(dir, rel), { recursive: true })
  if (o.frames) {
    await Promise.all(nodes.map((n, i) => writeFile(join(dir, rel, `${clip.id}_${pad(i)}.png`), rasterize(n, w, h, w / 2, h / 2))))
  }
  // sprite sheet: one SVG with all frames tiled
  const cols = Math.min(nodes.length, Math.max(1, Math.floor(4096 / w)))
  const rows = Math.ceil(nodes.length / cols)
  const sheet = group(nodes.map((n, i) => group([n], { transform: { x: (i % cols) * w, y: Math.floor(i / cols) * h } })))
  await writeFile(join(dir, `${rel}.sheet.png`), rasterize(sheet, cols * w, rows * h, w / 2, h / 2))
  return {
    mode: clip.mode,
    duration: clip.duration,
    frames: nodes.length,
    width: w,
    height: h,
    anchor: [0.5, 0.5],
    files: o.frames ? `${rel}/${clip.id}_{i}.png` : undefined,
    sheet: { file: `${rel}.sheet.png`, cols, rows },
    sampling: {
      normalized: 'i = min(N-1, floor(p*N)), p = normalised approach progress (window ends at hit time)',
      once: 'i = min(N-1, round(t*fps)), t = seconds since judgement',
      loop: 'i = floor((t/duration mod 1)*N)',
      progress: 'i = round(progress*(N-1))',
      static: 'single still image',
    }[clip.mode],
  }
}

async function bakeBodies(ctx: DrawContext, dir: string, rel: string, only: (name: string) => boolean) {
  const out: Record<string, { file: string, width: number, height: number, repeat: 'y' | 'none', note: string }> = {}
  await mkdir(join(dir, rel), { recursive: true })
  const Wb = Math.ceil(ctx.unit * tokens.stroke.holdBody) + 2
  const tile = holdDashPeriod(ctx)
  const put = async (name: string, node: SceneNode, w: number, h: number, ox: number, oy: number, repeat: 'y' | 'none', note: string) => {
    if (!only(name))
      return
    const file = `${rel}/${name}.png`
    await writeFile(join(dir, file), rasterize(node, w, h, ox, oy))
    out[name] = { file, width: w, height: h, repeat, note }
  }
  const hctx: DrawContext = { ...ctx, bodyDirection: 'down' }
  await put('hold-track', holdBody({ length: tile * 4, progress: 0, appear: 0.999 }, hctx), Wb, tile, Wb / 2, 0, 'y', 'Unheld hold body; tile vertically. Scroll V by t·4·width for the conveyor.')
  await put('hold-done', holdBody({ length: tile * 4, progress: 1, appear: 0.999 }, hctx), Wb, tile, Wb / 2, 0, 'y', 'Completed hold body; tile vertically, mask by progress.')
  const endH = holdEndLength(ctx)
  const endL = tile * 4
  await put('hold-end', holdBody({ length: endL, progress: 0, appear: 0.999 }, hctx), Wb, endH, Wb / 2, endH - endL, 'none', 'Rounded far end with the dim full stop. Tile the body up to length − height, then this piece; its far edge is the hold end point.')
  await put('hold-end-lit', holdBody({ length: endL, progress: 1, appear: 0.999 }, hctx), Wb, endH, Wb / 2, endH - endL, 'none', 'Lit far end (fill landed, white full stop). Cross-fade from hold-end over progress 0.9–1.')
  const lw = Math.ceil(ctx.unit * tokens.stroke.holdBody) + 4
  await put('long-hold-rail', longHoldBody({ top: tile * 2, bottom: tile * 2, progress: 0 }, ctx), lw, tile, lw / 2, tile / 2, 'y', 'Long hold rail; tile vertically across the full play area.')
  await put('long-hold-done', longHoldBody({ top: tile * 2, bottom: tile * 2, progress: 1 }, ctx), lw, tile, lw / 2, tile / 2, 'y', 'Long hold completed fill; grows from the note toward both edges.')
  const dw = Math.ceil(ctx.unit * tokens.stroke.dragLine) + 2
  const dash = Math.max(1, Math.round(ctx.unit * tokens.stroke.dragDash))
  await put('drag-line', dragLine({ x1: 0, y1: 0, x2: 0, y2: dash * 8, dash }, ctx)!, dw, dash * 2, dw / 2, 0, 'y', 'Drag connection (white dashes, 50 % duty); tile along the segment from the source note, rotate to its angle.')
  return out
}

export async function bake(options: BakeOptions): Promise<FrameManifest> {
  const fps = options.fps ?? 30
  const scale = options.scale ?? 1
  const kinds = options.kinds ?? NOTE_KINDS
  const directions = options.directions ?? ['up', 'down']
  const palette: Palette = createPalette(options.palette)
  const log = options.onProgress ?? (() => {})
  const o = { fps, progressFrames: options.progressFrames ?? 61, frames: options.frames ?? true }
  const manifest: FrameManifest = {
    format: 'cytoid-notes/frames@1',
    fps,
    scale,
    unit: tokens.unit,
    pxPerUnit: tokens.unit * scale,
    palette: exportPalette(palette),
    notes: {},
    judgement: {},
    bodies: {},
  }
  await mkdir(options.outDir, { recursive: true })
  for (const kind of kinds) {
    for (const direction of directions) {
      const ctx = createContext(kind, { palette, direction, scale })
      const entry: Record<string, ClipManifest> = {}
      for (const clip of clipsOf(designs[kind])) {
        entry[clip.id] = await bakeClip(clip, ctx, options.outDir, `${kind}/${direction}/${clip.id}`, o)
        log(`${kind}/${direction}/${clip.id} (${entry[clip.id]!.frames}f)`)
      }
      ;(manifest.notes[kind] ??= {})[direction] = entry
    }
  }
  {
    const ctx = createContext('click', { palette, scale })
    for (const grade of GRADES)
      manifest.judgement[grade] = await bakeClip(judgementClips[grade], ctx, options.outDir, `judgement/${grade}`, o)
    manifest.judgement.capHeight = judgementCapHeight(ctx)
    manifest.judgement.placement = 'text centre on the note centre (inside the clear / miss effect)'
    log('judgement')
  }
  for (const direction of directions) {
    manifest.bodies[direction] = {}
    for (const fam of ['hold', 'long-hold', 'drag'] as const) {
      const kind: NoteKind = fam === 'drag' ? 'drag-child' : fam
      const ctx = createContext(kind, { palette, direction, scale })
      const relevant = (k: string) => fam === 'hold' ? k.startsWith('hold') : fam === 'long-hold' ? k.startsWith('long-hold') : k === 'drag-line'
      const b = await bakeBodies(ctx, options.outDir, `bodies/${direction}/${fam}`, relevant)
      for (const [k, v] of Object.entries(b))
        manifest.bodies[direction]![`${fam}:${k}`] = v
    }
    log(`bodies/${direction}`)
  }
  if (options.cylheim) {
    await bakeCylheim(options.outDir, palette, scale, log)
  }
  await writeFile(join(options.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

/** Cylheim-named compat export (`src/images/designer` drop-in names). */
async function bakeCylheim(outDir: string, palette: Palette, scale: number, log: (m: string) => void) {
  const dir = join(outDir, 'cylheim')
  await mkdir(dir, { recursive: true })
  for (const t of CYLHEIM_TARGETS) {
    const ctx = createContext(t.kind, { palette, direction: t.direction ?? 'up', scale: scale * CYLHEIM_PX_PER_UNIT / (t.displayScale ?? 1) })
    const samples = cylheimSamples(t)
    const nodes = samples.map(s => t.draw(s.x, ctx))
    const { w, h } = canvasFor(nodes)
    await Promise.all(samples.map((s, i) => writeFile(join(dir, t.pattern.replace('{frame}', pad(s.f))), rasterize(nodes[i]!, w, h, w / 2, h / 2))))
    log(`cylheim/${t.pattern}`)
  }
}

export { CYLHEIM_PX_PER_UNIT, CYLHEIM_TARGETS, cylheimSamples } from './cylheim'
export * from './sample'
