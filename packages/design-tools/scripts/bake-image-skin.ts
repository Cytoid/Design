import type { Clip, Direction, DrawContext, Grade, NoteKind, Palette, SceneNode, Skin, TimedGrade, Timing } from '@cytoid/notes'
/**
 * Baked-image skin variant of the flat skin for C# image/sequence validation.
 *
 *   pnpm --filter @cytoid/design-tools bake-image-skin
 *
 * Renders every feedback slot of packages/skin-flat/src/flat.skin.json
 * (judgement ×5, timing ×3×2, combined ×3×2) plus the click:clear:perfect slot
 * into fixed 320×320 PNG sequences (1 design px = 1 canvas px, note origin at
 * canvas centre, default palette, click context: unit 128 / approach 1.2 /
 * direction up), then emits packages/skin-flat/src/flat-baked.skin.json — the
 * flat document with those 18 slot bindings repointed at new `sequence`
 * animations whose frames are `image` leaves referencing the baked PNGs.
 * Every other slot, animation and frame is untouched; schemaVersion stays 2.
 *
 * flat-baked.skin.json + assets-baked/ are validation assets only — nothing in
 * @cytoid/skin-flat exports them.
 *
 * Timing: fps 30, frame i at t = i/30 s (the `once` clip driver: seconds
 * since judgement), frame count ceil(duration·30)+1 — sampled with the
 * library's own sampleTimes (packages/notes/src/sample.ts), whose `once`
 * rule is exactly this (its 1e-6 guard absorbs float dust like 0.8·30).
 *
 * Rasterisation reuses the design-tools bake pipeline verbatim: toSVGMarkup
 * wrapped in the same SVG shell as rasterize() (../src/bake.ts), rendered by
 * rasterizeSvg() (../src/render.ts). No raster math is reimplemented here.
 */
import type { Buffer } from 'node:buffer'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileSkin, DEFAULT_RING_COLOR, derivePalette, FAMILY_OF, LoadedSkin, loadSkinResources, parseSkin, sampleTimes, toSVGMarkup, validateSkin } from '@cytoid/notes'
import { rasterizeSvg } from '../src/render'

// ------------------------------------------------------------------ paths --
const here = dirname(fileURLToPath(import.meta.url))
const flatSrc = join(here, '..', '..', 'skin-flat', 'src')
const assetsRel = 'assets-baked'

// ------------------------------------------------- rasterisation (bake) ----
// Verbatim composite of rasterize() (../src/bake.ts) and rasterizeSvg()
// (../src/render.ts). Origin (ox, oy) is the note centre inside the w×h canvas.
function rasterizeNode(node: SceneNode, w: number, h: number, ox: number, oy: number): Buffer {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${ox} ${oy})">${toSVGMarkup(node)}</g></svg>`
  return rasterizeSvg(svg)
}

// ---------------------------------------------------------- skin + palette --
// Glue identical to golden-skin.ts / skin-flat's createPalette (default
// palette from the document meta; derivePalette does the math).
const sourceDocument = JSON.parse(readFileSync(join(flatSrc, 'flat.skin.json'), 'utf8')) as Skin
const sourceSkin = parseSkin(sourceDocument)
const designs = compileSkin(new LoadedSkin(sourceSkin, new Map()))

const metaPalette = sourceSkin.meta?.palette
const hueTable = metaPalette?.hue ?? {}
const chroma = metaPalette?.chroma ?? 0.165
const grades: Record<Grade, string> = {
  ...(sourceSkin.meta?.grades ?? {}),
  ...(metaPalette?.grade ?? {}),
} as Record<Grade, string>
if (Object.keys(grades).length !== 5)
  throw new Error('skin meta must define all five grade colours')

const UNIT = 128
const note = (family: string, direction: Direction) => derivePalette(hueTable[family]?.[direction] ?? 247, { chroma })
const basePalette: Palette = {
  note: (kind: NoteKind, dir: Direction) => note(FAMILY_OF[kind], dir),
  family: (family, dir) => note(family, dir),
  grade: grades,
  ring: DEFAULT_RING_COLOR,
}
const clickContext: DrawContext = {
  kind: 'click',
  ringStroke: UNIT * 0.085,
  hairStroke: UNIT * 0.022,
  palette: basePalette.note('click', 'up'),
  grades: basePalette.grade,
  colors: basePalette,
  direction: 'up',
  bodyDirection: 'up',
  heading: 0.3,
  approach: 1.2,
  size: UNIT, // tokens.size('click') = 1
  unit: UNIT,
}

// -------------------------------------------------------------- the slots --
// The 17 feedback clips (same resolution as golden-skin.ts's feedback grid)
// plus the one clear slot. slot key → compiled clip.
const FEEDBACK_SLOTS: Record<string, Clip> = {}
for (const [grade, clip] of Object.entries(designs.feedback.judgement)) {
  if (!clip)
    throw new Error(`feedback:judgement:${grade} did not compile`)
  FEEDBACK_SLOTS[`feedback:judgement:${grade}`] = clip
}
for (const grade of ['great', 'good', 'bad'] as const) {
  for (const timing of ['fast', 'slow'] as const) {
    const t = (designs.feedback.timing as Record<TimedGrade, Partial<Record<Timing, Clip>>>)[grade]?.[timing]
    const c = (designs.feedback.combined as Record<TimedGrade, Partial<Record<Timing, Clip>>>)[grade]?.[timing]
    if (!t || !c)
      throw new Error(`feedback timing:${grade}:${timing} did not compile`)
    FEEDBACK_SLOTS[`feedback:timing:${grade}:${timing}`] = t
    FEEDBACK_SLOTS[`feedback:combined:${grade}:${timing}`] = c
  }
}
FEEDBACK_SLOTS['click:clear:perfect'] = designs.click.clear.perfect!
if (Object.keys(FEEDBACK_SLOTS).length !== 18)
  throw new Error(`expected 18 slots, resolved ${Object.keys(FEEDBACK_SLOTS).length}`)

const dash = (slot: string) => slot.replaceAll(':', '-')
const pad = (i: number) => String(i).padStart(3, '0')
const FPS = 30
const BUDGET_BYTES = 15 * 1024 * 1024

function sampleClip(clip: Clip, slot: string): number[] {
  if (clip.mode !== 'once')
    throw new Error(`${slot}: expected mode "once" (seconds since judgement), got "${clip.mode}"`)
  const xs = sampleTimes(clip, FPS)
  const specCount = Math.ceil(clip.duration * FPS) + 1
  if (xs.length !== specCount)
    console.warn(`  note: ${slot} sampleTimes count ${xs.length} ≠ spec formula ${specCount} (float dust)`)
  return xs
}

interface BakedSlot {
  slot: string
  key: string
  frames: string[]
  count: number
  bytes: number
}

/** Render all 18 slots at (fps, canvas) and return the written frames + bytes. */
function bakeAll(fps: number, canvas: number): { slots: BakedSlot[], totalBytes: number, totalFrames: number, durations: Map<string, number> } {
  const half = canvas / 2
  rmSync(join(flatSrc, assetsRel), { recursive: true, force: true }) // no stale frames from a previous variant
  const baked: BakedSlot[] = []
  const durations = new Map<string, number>()
  let totalBytes = 0
  let totalFrames = 0
  for (const [slot, clip] of Object.entries(FEEDBACK_SLOTS)) {
    durations.set(slot, clip.duration)
    const xs = fps === FPS
      ? sampleClip(clip, slot)
      : sampleTimes(clip, fps)
    const key = dash(slot)
    const dir = join(flatSrc, assetsRel, key)
    mkdirSync(dir, { recursive: true })
    const frames: string[] = []
    let bytes = 0
    xs.forEach((t, i) => {
      const node = clip.draw(t, clickContext)
      const png = rasterizeNode(node, canvas, canvas, half, half)
      const name = `${pad(i)}.png`
      writeFileSync(join(dir, name), png)
      frames.push(`img-${key}-${pad(i)}`)
      bytes += png.length
    })
    baked.push({ slot, key, frames, count: frames.length, bytes })
    totalBytes += bytes
    totalFrames += frames.length
  }
  return { slots: baked, totalBytes, totalFrames, durations }
}

// --------------------------------------------------------------- baking ----
// Spec default: 30 fps at 320×320 (1 design px = 1 canvas px). If the PNG
// corpus exceeds the size budget, fall back per spec: fps 24, then 256×256.
const VARIANTS = [
  { fps: 30, canvas: 320 },
  { fps: 24, canvas: 320 },
  { fps: 24, canvas: 256 },
]
let chosen = VARIANTS[0]!
let result = bakeAll(chosen.fps, chosen.canvas)
for (let i = 1; i < VARIANTS.length && result.totalBytes > BUDGET_BYTES; i++) {
  console.warn(`variant ${chosen.fps}fps @${chosen.canvas}px = ${(result.totalBytes / 1048576).toFixed(2)} MB over budget, falling back`)
  chosen = VARIANTS[i]!
  result = bakeAll(chosen.fps, chosen.canvas)
}
const { slots: bakedSlots, totalFrames, durations } = result

// ------------------------------------------------------------ document ----
// Copy of the flat document; the 18 slot bindings are repointed at new
// sequence animations backed by image frames. Everything else stays as-is.
const bakedDocument: Record<string, any> = JSON.parse(JSON.stringify(sourceDocument))
bakedDocument.id = 'flat-baked'
bakedDocument.name = 'Flat (baked validation)'
for (const slotInfo of bakedSlots) {
  const slot = bakedDocument.slots[slotInfo.slot]
  if (!slot)
    throw new Error(`source document has no slot "${slotInfo.slot}"`)
  const animationId = `baked-${slotInfo.key}`
  slotInfo.frames.forEach((frameId, i) => {
    bakedDocument.frames[frameId] = {
      type: 'image',
      src: `${assetsRel}/${slotInfo.key}/${pad(i)}.png`,
      x: -(chosen!.canvas / 2),
      y: -(chosen!.canvas / 2),
      w: chosen!.canvas,
      h: chosen!.canvas,
    }
  })
  bakedDocument.animations[animationId] = {
    type: 'sequence',
    fps: chosen!.fps,
    frames: slotInfo.frames,
  }
  slot.animation = animationId
}

// ------------------------------------------------------------ validate ----
// The baked document must pass the full design-repo pipeline: schema parse,
// cross-asset validation, and compilation with every PNG actually loaded
// (loadSkinResources re-runs parseSkin + validateSkin and byte-verifies each
// PNG header via pngSize; compileSkin needs the resources registered).
const reparsed = parseSkin(JSON.parse(JSON.stringify(bakedDocument)))
validateSkin(reparsed)
const loaded = await loadSkinResources(bakedDocument, {
  resolve: async path => new Uint8Array(readFileSync(join(flatSrc, path))),
})
compileSkin(loaded)
console.log('OK: parseSkin + validateSkin + loadSkinResources + compileSkin passed on flat-baked.skin.json')

// --------------------------------------------------------------- output ----
const outPath = join(flatSrc, 'flat-baked.skin.json')
writeFileSync(outPath, `${JSON.stringify(bakedDocument)}\n`)

// Actual on-disk corpus (sanity: every PNG non-empty).
let diskFiles = 0
let diskBytes = 0
function walk(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(p)
    }
    else {
      const size = statSync(p).size
      if (size === 0)
        throw new Error(`empty PNG: ${p}`)
      diskFiles++
      diskBytes += size
    }
  }
}
walk(join(flatSrc, assetsRel))

console.log(`\nflat-baked.skin.json written: ${outPath}`)
console.log(`variant: ${chosen!.fps} fps @ ${chosen!.canvas}×${chosen!.canvas}`)
for (const slotInfo of bakedSlots)
  console.log(`  ${slotInfo.slot.padEnd(30)} duration=${durations.get(slotInfo.slot)}s frames=${slotInfo.count} bytes=${slotInfo.bytes}`)
console.log(`total: ${bakedSlots.length} slots, ${totalFrames} frames, ${diskFiles} files, ${(diskBytes / 1048576).toFixed(2)} MB on disk`)
if (diskBytes > BUDGET_BYTES)
  console.warn(`WARNING: corpus exceeds budget (${diskBytes} > ${BUDGET_BYTES})`)
