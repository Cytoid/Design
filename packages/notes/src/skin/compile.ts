import type { GroupNode, SceneNode } from '../core/scene'
import type { Clip, DrawContext, FeedbackSkin, NoteSkin } from '../notes/types'
import type { Grade, NoteKind } from '../tokens'
import type { Primitive } from './primitive'
import type { CompiledTrack, Env } from './runtime'
import type { Layer, Skin, Time, Track } from './schema'
import { NOTE_KINDS, noteTiming } from '../tokens'
import { resolveBodyInputs, resolveInputs } from './inputs'
import { LoadedSkin } from './resources'
import { compileGate, compileNum, compilePrimitive, compileTrack, compileTransform, gateOpen, makeEnv } from './runtime'
import { parseSkin } from './schema'
import { feedbackBindings, slotProgress, slotRegistry } from './slots'
import { validateSkin } from './validate'

export interface AnimationClock { elapsed: number, duration: number }
type DrawAnimation = (p: number, ctx: DrawContext, inputs: Record<string, number>, clock: AnimationClock) => GroupNode
type DrawLayer = (env: Env, p: number, ctx: DrawContext, clock: AnimationClock) => SceneNode | null
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
    at(p, inputs, env, ctx) {
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
      return compiled.at(p, inputs, env, ctx)
    },
  }
}

function animationCompiler(skin: Skin, images: LoadedSkin['images']): (id: string) => DrawAnimation {
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
        const emit = compilePrimitive({ ...frame, ...props } as Primitive, images)
        const children = (layer.layers ?? []).map(buildLayer)
        draw = (env, p, ctx, clock) => {
          const node = emit(env, ctx)
          if (node.type === 'group') {
            for (const child of children) {
              const result = child(env, p, ctx, clock)
              if (result)
                node.children.push(result)
            }
          }
          return wrapperTransform ? { type: 'group', transform: wrapperTransform(env), children: [node] } : node
        }
      }
      else {
        const sourceId = layer.source.animation
        const child = build(sourceId)
        const sample = layer.source.sample
        const from = sample?.from ?? 0
        const to = sample?.to ?? 1
        const start = compileNum(from)
        const end = compileNum(to)
        const opacity = layer.properties?.opacity !== undefined ? compileNum(layer.properties.opacity) : null
        const transform = layer.properties?.transform ? compileTransform(layer.properties.transform) : null
        draw = (env, p, ctx, clock) => {
          const local = sample ? clampTime(start(env) + (end(env) - start(env)) * p) : p
          const sourceAnimation = skin.animations[sourceId]!
          const sampleDuration = sourceAnimation.type === 'sequence' && sourceAnimation.fps !== undefined ? sourceAnimation.frames.length / sourceAnimation.fps : clock.duration
          const elapsed = sample ? local * sampleDuration : clock.elapsed
          const node = child(local, ctx, env.inputs, { elapsed, duration: clock.duration })
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
      return (env, p, ctx, clock) => {
        const at = layer.at ?? 0
        const until = layer.until ?? 1
        const windowed = layer.at !== undefined || layer.until !== undefined
        if (windowed && (p < at || p > until || (p === until && until !== 1)))
          return null
        if (!gateOpen(gate, p, env))
          return otherwise ? otherwise(env, p, ctx, clock) : null
        const localClock = windowed ? { elapsed: clock.elapsed - at * clock.duration, duration: (until - at) * clock.duration } : clock
        const node = draw(env, windowed ? (p - at) / (until - at) : p, ctx, localClock)
        return node && layer.blend ? { type: 'group', blend: layer.blend, children: [node] } : node
      }
    }
    const layers = animation.type === 'layers' ? animation.layers.map(buildLayer) : []
    const frames = animation.type === 'sequence' ? animation.frames.map(id => compilePrimitive(skin.frames[id] as Primitive, images)) : []
    const draw: DrawAnimation = (p, ctx, inputs, clock) => {
      const env = makeEnv(inputs, tracks, p, ctx)
      const node: GroupNode = { type: 'group', children: [] }
      if (animation.type === 'sequence' && p >= 0 && p <= 1) {
        const position = animation.fps === undefined ? Math.max(0, p) * frames.length : Math.max(0, clock.elapsed) * animation.fps
        const index = Math.min(Math.floor(position), frames.length - 1)
        node.children.push(frames[index]!(env, ctx))
      }
      for (const layer of layers) {
        const child = layer(env, p, ctx, clock)
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
export function compileAnimation(json: unknown, animation: string): (p: number, ctx: DrawContext, clock?: AnimationClock) => SceneNode {
  const loaded = json instanceof LoadedSkin ? json : new LoadedSkin(parseSkin(json), new Map())
  const skin = loaded.document
  validateSkin(skin)
  if (!Object.hasOwn(skin.animations, animation))
    throw new Error(`unknown animation "${animation}"`)
  const draw = animationCompiler(skin, loaded.images)(animation)
  return (p, ctx, clock = { elapsed: p, duration: 1 }) => {
    if (!Number.isFinite(p))
      throw new Error('animation progress must be finite')
    const inputs = resolveInputs(ctx)
    if (!Number.isFinite(clock.elapsed) || !Number.isFinite(clock.duration) || clock.duration <= 0)
      throw new Error('animation clock must be finite with positive duration')
    return draw(p, ctx, inputs, clock)
  }
}

/** Sequence-containing approach clips need their zero-time pose in offline output. */
function sequenceDetector(skin: Skin): (id: string) => boolean {
  const cache = new Map<string, boolean>()
  function visitLayer(layer: Layer): boolean {
    return ('animation' in layer.source && visit(layer.source.animation))
      || (layer.layers ?? []).some(visitLayer) || (!!layer.otherwise && visitLayer(layer.otherwise))
  }
  function visit(id: string): boolean {
    if (cache.has(id))
      return cache.get(id)!
    const animation = skin.animations[id]!
    const result = animation.type === 'sequence' || animation.layers.some(visitLayer)
    cache.set(id, result)
    return result
  }
  return visit
}

/** Incomplete kinds and feedback modes inherit their entire group from the fallback. */
export function compileSkin(json: unknown, fallback?: NoteSkin): NoteSkin {
  const loaded = json instanceof LoadedSkin ? json : new LoadedSkin(parseSkin(json), new Map())
  const skin = loaded.document
  validateSkin(skin)
  const build = animationCompiler(skin, loaded.images)
  const hasSequence = sequenceDetector(skin)
  const designs = {} as NoteSkin
  for (const kind of NOTE_KINDS) {
    const required = ['enter', 'clear:perfect', 'clear:great', 'clear:good', 'clear:bad']
    if (kind === 'hold' || kind === 'long-hold')
      required.push('body')
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
        ...(hasSequence(binding.animation) ? { includeStart: true } : {}),
        id: contract.id,
        mode: contract.mode,
        duration: contract.duration,
        ...(binding.note ? { note: binding.note } : {}),
        draw(x, ctx) {
          if (!Number.isFinite(x))
            throw new Error(`${name}: driver must be finite`)
          const inputs = resolveInputs(ctx)
          inputs.exitRewindEnd = 1 - contract.duration * noteTiming.exit.rewind / Math.max(1e-6, ctx.approach)
          const grade = path.startsWith('clear:') ? path.slice(6) as Grade : path === 'miss' ? 'miss' : undefined
          const p = slotProgress(contract, x)
          const duration = contract.mode === 'normalized' ? ctx.approach : contract.duration
          return draw(p, { ...ctx, grade }, inputs, { elapsed: p * duration, duration })
        },
      }
    }
    const design: NoteSkin[NoteKind] = {
      kind,
      enter: clip('enter')!,
      clear: { perfect: clip('clear:perfect')!, great: clip('clear:great')!, good: clip('clear:good')!, bad: clip('clear:bad')! },
    }
    if (kind === 'hold' || kind === 'long-hold') {
      const draw = build(skin.slots[`${kind}:body`]!.animation)
      design.body = {
        draw(options, context) {
          const ctx = { ...context, kind, grade: undefined }
          const inputs = resolveBodyInputs(ctx, options)
          const node = draw(inputs.progress!, ctx, inputs, { elapsed: inputs.elapsed!, duration: inputs.duration! || 1 })
          // Hold bodies are authored along +y, independent of scan/color direction.
          return kind === 'hold' && ctx.bodyDirection === 'up'
            ? { type: 'group', transform: { scaleY: -1 }, children: [node] }
            : node
        },
      }
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
  const feedback = {} as FeedbackSkin
  for (const view of ['judgement', 'timing', 'combined'] as const) {
    const bindings = feedbackBindings.filter(binding => binding.view === view)
    const missing = bindings.filter(binding => !Object.hasOwn(skin.slots, binding.name))
    if (missing.length) {
      if (!fallback)
        throw new Error(`feedback:${view}: missing required slots: ${missing.map(binding => binding.name).join(', ')}`)
      Object.assign(feedback, { [view]: fallback.feedback[view] })
      continue
    }
    const entries: Record<string, Clip | Record<string, Clip>> = {}
    for (const binding of bindings) {
      const slot = skin.slots[binding.name]!
      const contract = slotRegistry.get(binding.name)!
      const draw = build(slot.animation)
      const clip: Clip = {
        id: binding.name,
        mode: 'once',
        duration: contract.duration,
        ...(hasSequence(slot.animation) ? { includeStart: true } : {}),
        ...(slot.note ? { note: slot.note } : {}),
        draw(t, ctx) {
          if (!Number.isFinite(t))
            throw new Error(`${binding.name}: driver must be finite`)
          return draw(t / contract.duration, { ...ctx, grade: binding.grade }, resolveInputs(ctx), { elapsed: t, duration: contract.duration })
        },
      }
      if (binding.timing)
        ((entries[binding.grade] ??= {}) as Record<string, Clip>)[binding.timing] = clip
      else entries[binding.grade] = clip
    }
    Object.assign(feedback, { [view]: entries })
  }
  designs.feedback = feedback
  return designs
}
