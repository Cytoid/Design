/**
 * Frame-animation baker (Node only). Rasterises the vector designs with
 * resvg into PNG sequences + per-clip sprite sheets + a JSON manifest.
 */
import type { Clip, Direction, DrawContext, Grade, NoteKind, NoteSkin, Palette, PaletteOptions, SceneNode, TimedGrade, Timing } from '@cytoid/notes'

import type { Buffer } from 'node:buffer'
import type { BakeAppearance } from './types'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { bounds, clipsOf, exportPalette, GRADES, group, NOTE_KINDS, sampleTimes, TIMED_GRADES, toSVGMarkup } from '@cytoid/notes'
import { rasterizeSvg } from './render'

export interface BakeOptions {
  appearance: BakeAppearance
  /** Compiled skin for the native sheets. */
  skin?: NoteSkin
  outDir: string
  /** frames per second */
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
  format: 'cytoid-notes/frames@2'
  fps: number
  scale: number
  unit: number
  /** px per design unit — divide texture size by this to get size relative to a click note */
  pxPerUnit: number
  palette: ReturnType<typeof exportPalette>
  notes: Partial<Record<NoteKind, Partial<Record<Direction, Record<string, ClipManifest>>>>>
  /**
   * Per-kind feedback clips, already composed around the note origin. Kinds
   * usually share animations, but each is baked separately so a skin can lay
   * out judgement text differently per note.
   */
  feedback: Partial<Record<NoteKind, {
    judgement: Partial<Record<Grade, ClipManifest>>
    timing: Partial<Record<TimedGrade, Record<Timing, ClipManifest>>>
    combined: Partial<Record<TimedGrade, Record<Timing, ClipManifest>>>
  }>>
  bodies: Partial<Record<Direction, Record<string, { file: string, width: number, height: number, repeat: 'y' | 'none', note: string }>>>
}

const pad = (i: number) => String(i).padStart(5, '0')

export function rasterize(node: SceneNode, w: number, h: number, ox: number, oy: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${ox} ${oy})">${toSVGMarkup(node)}</g></svg>`
  return rasterizeSvg(svg)
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
      normalized: clip.includeStart ? 'i = min(N-1, floor(p*(N-1))), including the exact zero-time pose' : 'i = min(N-1, floor(p*N)), p = normalised approach progress (window ends at hit time)',
      once: 'i = min(N-1, round(t*fps)), t = seconds since judgement',
      loop: 'i = duration > 0 ? floor((t/duration mod 1)*N) : 0 — duration 0 freezes on the first frame',
      progress: 'i = round(progress*(N-1))',
    }[clip.mode],
  }
}

async function bakeBodies(ctx: DrawContext, dir: string, rel: string, only: (name: string) => boolean, appearance: BakeAppearance, skin: NoteSkin) {
  const { metrics: tokens, holdDashPeriod, holdBody, longHoldBody, chainLink } = appearance
  const out: Record<string, { file: string, width: number, height: number, repeat: 'y' | 'none', note: string }> = {}
  await mkdir(join(dir, rel), { recursive: true })
  const Wb = Math.ceil(ctx.unit * tokens.stroke.holdBody) + 2
  const tile = holdDashPeriod(ctx)
  const put = async (name: string, draw: () => SceneNode, w: number, h: number, ox: number, oy: number, repeat: 'y' | 'none', note: string) => {
    if (!only(name))
      return
    const file = `${rel}/${name}.png`
    await writeFile(join(dir, file), rasterize(draw(), w, h, ox, oy))
    out[name] = { file, width: w, height: h, repeat, note }
  }
  const hctx: DrawContext = { ...ctx, bodyDirection: 'down' }
  await put('hold-track', () => holdBody({ length: tile * 4, progress: 0, appear: 0.999 }, hctx, skin), Wb, tile, Wb / 2, 0, 'y', 'Unheld hold body; tile vertically from the hold end point toward the head (flat end — no end piece). Scroll V by t·4·width for the conveyor.')
  await put('hold-done', () => holdBody({ length: tile * 4, progress: 1, appear: 0.999 }, hctx, skin), Wb, tile, Wb / 2, 0, 'y', 'Completed hold body; tile vertically, mask by progress.')
  const lw = Math.ceil(ctx.unit * tokens.stroke.holdBody) + 4
  await put('long-hold-rail', () => longHoldBody({ top: tile * 2, bottom: tile * 2, progress: 0, t: 0 }, ctx, skin), lw, tile, lw / 2, tile / 2, 'y', 'Long hold rail with the centre conveyor; tile vertically across the full play area. Scroll the dashes toward the note at t·4·width (both halves share the dash grid at rest). Over the fill the same grid runs in 800, softer.')
  await put('long-hold-done', () => longHoldBody({ top: tile * 2, bottom: tile * 2, progress: 1, t: 0 }, ctx, skin), lw, tile, lw / 2, tile / 2, 'y', 'Long hold completed fill; grows from the note toward both edges.')
  const dw = Math.ceil(ctx.unit * tokens.stroke.dragLine) + 2
  const dash = Math.max(1, Math.round(ctx.unit * tokens.stroke.dragDash))
  // Chain-link strip: the skin's raw template (no window), tiled at the flat
  // spatial period (width; the Cytoid pattern is 50 % duty — period = 2·dash).
  await put(
    'chain-link',
    () => chainLink({ length: dash * 16, t: 0 }, ctx, skin)!,
    dw,
    dash * 2,
    dw / 2,
    0,
    'y',
    'Drag connection chain (Cytoid: white dashes, 50 % duty, gap at the source end); tile along the link from the source note, rotate toward the destination, mask by the engine lead/trail window.',
  )
  return out
}

export async function bake(options: BakeOptions): Promise<FrameManifest> {
  const appearance = options.appearance
  const { designs, createPalette, createContext, metrics: tokens } = appearance
  const skin = options.skin ?? designs
  const fps = options.fps ?? 30
  const scale = options.scale ?? 1
  const kinds = options.kinds ?? NOTE_KINDS
  const directions = options.directions ?? ['up', 'down']
  const palette: Palette = createPalette(options.palette)
  const log = options.onProgress ?? (() => {})
  const o = { fps, progressFrames: options.progressFrames ?? 61, frames: options.frames ?? true }
  const manifest: FrameManifest = {
    format: 'cytoid-notes/frames@2',
    fps,
    scale,
    unit: tokens.unit,
    pxPerUnit: tokens.unit * scale,
    palette: exportPalette(palette),
    notes: {},
    feedback: {},
    bodies: {},
  }
  await mkdir(options.outDir, { recursive: true })
  for (const kind of kinds) {
    for (const direction of directions) {
      const ctx = createContext(kind, { palette, direction, scale })
      const entry: Record<string, ClipManifest> = {}
      for (const clip of clipsOf(skin[kind])) {
        entry[clip.id] = await bakeClip(clip, ctx, options.outDir, `${kind}/${direction}/${clip.id}`, o)
        log(`${kind}/${direction}/${clip.id} (${entry[clip.id]!.frames}f)`)
      }
      ;(manifest.notes[kind] ??= {})[direction] = entry
    }
    // Feedback is kind-scoped but direction-independent (`createContext` defaults to up).
    const ctx = createContext(kind, { palette, scale })
    const feedback: NonNullable<FrameManifest['feedback'][NoteKind]> = { judgement: {}, timing: {}, combined: {} }
    for (const grade of GRADES)
      feedback.judgement[grade] = await bakeClip(skin[kind].feedback.judgement[grade], ctx, options.outDir, `${kind}/feedback/judgement/${grade}`, o)
    for (const view of ['timing', 'combined'] as const) {
      for (const grade of TIMED_GRADES) {
        const entries = {} as Record<Timing, ClipManifest>
        for (const value of ['fast', 'slow'] as const)
          entries[value] = await bakeClip(skin[kind].feedback[view][grade][value], ctx, options.outDir, `${kind}/feedback/${view}/${grade}-${value}`, o)
        feedback[view][grade] = entries
      }
    }
    manifest.feedback[kind] = feedback
    log(`${kind}/feedback`)
  }
  for (const direction of directions) {
    manifest.bodies[direction] = {}
    for (const fam of ['hold', 'long-hold', 'drag', 'click-drag'] as const) {
      const kind: NoteKind = fam === 'hold' ? 'hold' : fam === 'long-hold' ? 'long-hold' : fam === 'drag' ? 'drag-head' : 'click-drag-head'
      const ctx = createContext(kind, { palette, direction, scale })
      const relevant = (k: string) => fam === 'hold' ? k.startsWith('hold') : fam === 'long-hold' ? k.startsWith('long-hold') : k === 'chain-link'
      const b = await bakeBodies(ctx, options.outDir, `bodies/${direction}/${fam}`, relevant, appearance, skin)
      for (const [k, v] of Object.entries(b))
        manifest.bodies[direction]![`${fam}:${k}`] = v
    }
    log(`bodies/${direction}`)
  }
  await writeFile(join(options.outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export { frameIndex, sampleTimes } from '@cytoid/notes'
