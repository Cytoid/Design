import type { GroupNode, SceneNode } from '../core/scene'
import type { Clip, DrawContext, NoteDesign } from '../notes/types'
import type { NoteKind } from '../tokens'
import type { Primitive } from './primitive'
import type { CompiledTrack, Env } from './runtime'
import type { Layer, Skin, Time, Track } from './schema'
import { NOTE_KINDS, noteTiming } from '../tokens'
import { resolveInputs } from './inputs'
import { compileGate, compileNum, compilePrimitive, compileTrack, compileTransform, gateOpen, makeEnv } from './runtime'
import { parseSkin } from './schema'
import { slotProgress, slotRegistry } from './slots'
import { validateSkin } from './validate'

type DrawAnimation = (p: number, ctx: DrawContext, inputs: Record<string, number>) => GroupNode
type DrawLayer = (env: Env, p: number, ctx: DrawContext) => SceneNode | null
const clampTime = (p: number) => Math.max(0, Math.min(1, p))

function timeAt(value: Time, inputs: Record<string, number>): number {
  if (typeof value === 'number')
    return value
  const result = inputs[value.input]
  if (result === undefined || !Number.isFinite(result))
    throw new Error(`missing time input "${value.input}"`)
  return result
}
function compiledTrack(track: Track): CompiledTrack {
  const compiled = compileTrack(track)
  const windows = 'keys' in track
    ? track.keys.flatMap(key => key.window ? [key.window] : [])
    : 'curve' in track && track.curve === 'bump'
      ? track.windows
      : 'curve' in track && track.curve === 'damped' ? [{ from: track.from, to: track.to }] : []
  const dynamic = ('keys' in track && track.keys.some(key => typeof key.at !== 'number'))
    || windows.some(window => typeof window.from !== 'number' || typeof window.to !== 'number')
  if (!dynamic)
    return compiled
  // Only context-dependent endpoints need checking in the draw path.
  return {
    phase: compiled.phase,
    at(p, inputs) {
      if ('keys' in track) {
        let previous = -Infinity
        for (const key of track.keys) {
          const at = timeAt(key.at, inputs)
          if (at < 0 || at > 1 || at <= previous)
            throw new Error('resolved key times must increase strictly within 0..1')
          previous = at
        }
      }
      for (const window of windows) {
        if (timeAt(window.from, inputs) >= timeAt(window.to, inputs))
          throw new Error('invalid resolved track window')
      }
      return compiled.at(p, inputs)
    },
  }
}

function animationCompiler(skin: Skin): (id: string) => DrawAnimation {
  const cache = new Map<string, DrawAnimation>()
  const build = (id: string): DrawAnimation => {
    const cached = cache.get(id)
    if (cached)
      return cached
    const animation = skin.animations[id]!
    const tracks = new Map(Object.entries(animation.tracks ?? {}).map(([name, track]) => [name, compiledTrack(track)]))
    const rootOpacity = animation.properties?.opacity !== undefined ? compileNum(animation.properties.opacity) : null
    const rootTransform = animation.properties?.transform ? compileTransform(animation.properties.transform) : null
    const buildLayer = (layer: Layer): DrawLayer => {
      const gate = layer.when ? compileGate(layer.when) : null
      const otherwise = layer.otherwise ? buildLayer(layer.otherwise) : null
      let draw: DrawLayer
      if ('frame' in layer.source) {
        const frame = skin.frames[layer.source.frame]!
        const props = { ...layer.properties }
        const wrap = frame.type !== 'group' && props.transform !== undefined
        const wrapperTransform = wrap && props.transform ? compileTransform(props.transform) : null
        if (wrap)
          delete props.transform
        const emit = compilePrimitive({ ...frame, ...props } as Primitive)
        const children = (layer.layers ?? []).map(buildLayer)
        draw = (env, p, ctx) => {
          const node = emit(env, ctx)
          if (node.type === 'group') {
            for (const child of children) {
              const result = child(env, p, ctx)
              if (result)
                node.children.push(result)
            }
          }
          return wrapperTransform ? { type: 'group', transform: wrapperTransform(env), children: [node] } : node
        }
      }
      else {
        const child = build(layer.source.animation)
        const sample = layer.source.sample
        const from = sample?.from ?? 0
        const to = sample?.to ?? 1
        const start = compileNum(from)
        const end = compileNum(to)
        const opacity = layer.properties?.opacity !== undefined ? compileNum(layer.properties.opacity) : null
        const transform = layer.properties?.transform ? compileTransform(layer.properties.transform) : null
        draw = (env, p, ctx) => {
          const local = sample ? clampTime(start(env) + (end(env) - start(env)) * p) : p
          const node = child(local, ctx, env.inputs)
          if (!opacity && !transform)
            return node
          const wrapper: GroupNode = { type: 'group', children: [node] }
          if (opacity) {
            wrapper.opacity = opacity(env)
            wrapper.isolate = true
          }
          if (transform)
            wrapper.transform = transform(env)
          return wrapper
        }
      }
      return (env, p, ctx) => {
        const at = layer.at ?? 0
        const until = layer.until ?? 1
        const windowed = layer.at !== undefined || layer.until !== undefined
        if (windowed && (p < at || p > until || (p === until && until !== 1)))
          return null
        if (!gateOpen(gate, p, env))
          return otherwise ? otherwise(env, p, ctx) : null
        return draw(env, windowed ? (p - at) / (until - at) : p, ctx)
      }
    }
    const layers = animation.layers.map(buildLayer)
    const draw: DrawAnimation = (p, ctx, inputs) => {
      const env = makeEnv(inputs, tracks, p)
      const node: GroupNode = { type: 'group', children: [] }
      for (const layer of layers) {
        const child = layer(env, p, ctx)
        if (child)
          node.children.push(child)
      }
      if (rootOpacity)
        node.opacity = rootOpacity(env)
      if (rootTransform)
        node.transform = rootTransform(env)
      if (animation.isolate)
        node.isolate = true
      return node
    }
    cache.set(id, draw)
    return draw
  }
  return build
}

/** Compile a fragment for tooling/previews without requiring engine slot coverage. */
export function compileAnimation(json: unknown, animation: string): (p: number, ctx: DrawContext) => SceneNode {
  const skin = parseSkin(json)
  validateSkin(skin)
  if (!Object.hasOwn(skin.animations, animation))
    throw new Error(`unknown animation "${animation}"`)
  const draw = animationCompiler(skin)(animation)
  return (p, ctx) => {
    if (!Number.isFinite(p))
      throw new Error('animation progress must be finite')
    const inputs = resolveInputs(ctx)
    return draw(p, ctx, inputs)
  }
}

/** Compile the skin document. With fallback, incomplete kinds inherit the entire built-in kind. */
export function compileSkin(json: unknown, fallback?: Record<NoteKind, NoteDesign>): Record<NoteKind, NoteDesign> {
  const skin = parseSkin(json)
  validateSkin(skin)
  const build = animationCompiler(skin)
  const designs = {} as Record<NoteKind, NoteDesign>
  for (const kind of NOTE_KINDS) {
    const required = ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad']
    const hasHold = ['press', 'loopUnder', 'loopOver', 'progress'].some(path => Object.hasOwn(skin.slots, `${kind}:${path}`))
    if (hasHold)
      required.push('press', 'progress')
    const missing = required.filter(path => !Object.hasOwn(skin.slots, `${kind}:${path}`))
    if (missing.length) {
      if (fallback) {
        designs[kind] = fallback[kind]
        continue
      }
      throw new Error(`${kind}: missing required slots: ${missing.join(', ')}`)
    }
    const clip = (path: string): Clip | undefined => {
      const name = `${kind}:${path}`
      const binding = skin.slots[name]
      if (!binding)
        return undefined
      const contract = slotRegistry.get(name)!
      const draw = build(binding.animation)
      return {
        id: contract.id,
        mode: contract.mode,
        duration: contract.duration,
        ...(binding.note ? { note: binding.note } : {}),
        draw(x, ctx) {
          if (!Number.isFinite(x))
            throw new Error(`${name}: driver must be finite`)
          const inputs = resolveInputs(ctx)
          inputs.exitRewindEnd = 1 - contract.duration * noteTiming.exit.rewind / Math.max(1e-6, ctx.approach)
          return draw(slotProgress(contract, x), ctx, inputs)
        },
      }
    }
    const design: NoteDesign = {
      kind,
      enter: clip('enter')!,
      clear: { perfect: clip('clear:perfect')!, great: clip('clear:great')!, good: clip('clear:good')!, bad: clip('clear:bad')! },
    }
    const exit = clip('exit')
    const miss = clip('miss')
    if (exit)
      design.exit = exit
    if (miss)
      design.miss = miss
    if (hasHold) {
      design.hold = { press: clip('press')!, progress: clip('progress')! }
      const under = clip('loopUnder')
      const over = clip('loopOver')
      if (under)
        design.hold.loopUnder = under
      if (over)
        design.hold.loopOver = over
    }
    designs[kind] = design
  }
  return designs
}
