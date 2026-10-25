import type { Frame, Input, Layer, Skin, Track } from './schema'
import { isColorTrack } from './schema'
import { slotRegistry } from './slots'

export const propertyNames: Record<Frame['type'], readonly string[]> = {
  circle: ['cx', 'cy', 'r', 'stroke', 'strokeWidth', 'fill'],
  arc: ['cx', 'cy', 'r', 'start', 'end', 'stroke', 'strokeWidth', 'dash', 'dashOffset'],
  rect: ['x', 'y', 'w', 'h', 'rx', 'stroke', 'strokeWidth', 'fill'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'strokeWidth', 'dash', 'dashOffset'],
  poly: ['points', 'stroke', 'strokeWidth', 'fill'],
  ring: ['r', 'width', 'assemble', 'spin', 'stroke', 'strokeWidth', 'dash', 'dashOffset'],
  group: ['clip'],
}
const COMMON = new Set(['unit', 'size', 'heading', 'R', 'W', 'inner', 'ringC', 'innerHalf', 'hair', 'ringW'])
const HOLD = new Set(['bracketR', 'bracketW', 'holdLanding', 'glyphW', 'coreR', 'progressR', 'progressW'])
const FLICK = new Set(['flickW', 'rv', 'flickInner', 'coreMax', 'frameOuter', 'near', 'nearFar', 'approachNear', 'arrowSize', 'arrowTip', 'arrowHalf'])
const BODY = new Set(['appear', 'progress', 'elapsed', 'remaining', 'duration', 'bodyWidth', 'dashPeriod'])
const MAX_NODES = 20_000

function inspect(value: unknown, fn: (key: string, val: unknown) => void): void {
  if (!value || typeof value !== 'object')
    return
  for (const [key, val] of Object.entries(value)) {
    fn(key, val)
    inspect(val, fn)
  }
}
function validateTrack(track: Track, label: string): void {
  if ('keys' in track) {
    track.keys.forEach((key, i) => {
      if (i === 0 && key.ease)
        throw new Error(`${label}: first key cannot have ease`)
      if (typeof key.at === 'number') {
        if (key.at < 0 || key.at > 1)
          throw new Error(`${label}: key time outside 0..1`)
        const prev = track.keys[i - 1]?.at
        if (typeof prev === 'number' && prev >= key.at)
          throw new Error(`${label}: key times must increase strictly`)
      }
      if (key.window && typeof key.window.from === 'number' && typeof key.window.to === 'number' && key.window.from >= key.window.to)
        throw new Error(`${label}: invalid ease window`)
    })
  }
  if ('curve' in track && track.curve === 'damped' && typeof track.from === 'number' && typeof track.to === 'number' && track.from >= track.to)
    throw new Error(`${label}: invalid damped window`)
  if ('curve' in track && track.curve === 'bump') {
    for (const w of track.windows) {
      if (typeof w.from === 'number' && typeof w.to === 'number' && w.from >= w.to)
        throw new Error(`${label}: invalid bump window`)
    }
  }
}
function frameCost(frame: Frame): number {
  if (frame.type === 'group')
    return 1 + (frame.children ?? []).reduce((n, child) => n + frameCost(child), 0)
  if (frame.type === 'ring')
    return 1 + (1 + (frame.edge?.bands.length ?? 0)) * (1 + frame.segments)
  return 1
}

/** Validate every asset, including unused assets, before any draw is exposed. */
export function validateSkin(skin: Skin): Map<string, Set<Input>> {
  const inputs = new Map<string, Set<Input>>()
  const costs = new Map<string, number>()
  const active = new Set<string>()
  const heights = new Map<string, number>()
  if (Object.keys(skin.frames).length > 4096 || Object.keys(skin.animations).length > 4096)
    throw new Error('asset count budget exceeded')
  const visit = (id: string, depth = 0): number => {
    if (depth > 32)
      throw new Error('animation reference depth exceeds 32')
    if (active.has(id))
      throw new Error(`animation reference cycle: ${[...active, id].join(' -> ')}`)
    if (costs.has(id))
      return costs.get(id)!
    const animation = skin.animations[id]
    if (!animation)
      throw new Error(`unknown animation "${id}"`)
    active.add(id)
    const required = new Set<Input>()
    let height = 1
    const check = (value: unknown) => inspect(value, (key, val) => {
      if (key === 'input')
        required.add(val as Input)
      if (key === 'track' && !Object.hasOwn(animation.tracks ?? {}, val as string))
        throw new Error(`${id}: unknown track "${val}"`)
      if (key === 'clamp') {
        const c = val as { min?: number, max?: number }
        if ((c.min ?? 0) > (c.max ?? 1))
          throw new Error(`${id}: invalid clamp bounds`)
      }
    })
    for (const [name, track] of Object.entries(animation.tracks ?? {})) validateTrack(track, `${id}.${name}`)
    check(animation.tracks)
    check(animation.properties)
    const checkTypes = (value: unknown, color = false): void => {
      if (!value || typeof value !== 'object')
        return
      const obj = value as Record<string, unknown>
      if (typeof obj.track === 'string') {
        const track = animation.tracks?.[obj.track]
        if (track && !obj.phase && isColorTrack(track) !== color)
          throw new Error(`${id}: expected ${color ? 'color' : 'numeric'} track "${obj.track}"`)
      }
      for (const [key, child] of Object.entries(obj)) {
        if (key !== 'track')
          checkTypes(child, key === 'fill' || key === 'stroke')
      }
    }
    checkTypes(animation.tracks)
    checkTypes(animation.properties)
    const trackHeights = new Map<string, number>()
    const activeTracks = new Set<string>()
    const visitTrack = (name: string, depth = 0): number => {
      if (depth > 32)
        throw new Error(`${id}: track dependency depth exceeds 32`)
      if (activeTracks.has(name))
        throw new Error(`${id}: track dependency cycle at "${name}"`)
      if (trackHeights.has(name))
        return trackHeights.get(name)!
      activeTracks.add(name)
      let height = 1
      inspect(animation.tracks![name], (key, value) => {
        if (key === 'track')
          height = Math.max(height, 1 + visitTrack(value as string, depth + 1))
      })
      if (height > 32)
        throw new Error(`${id}: track dependency depth exceeds 32`)
      activeTracks.delete(name)
      trackHeights.set(name, height)
      return height
    }
    for (const name of Object.keys(animation.tracks ?? {})) visitTrack(name)
    const layerCost = (layer: Layer, nesting: number): number => {
      if (nesting > 32)
        throw new Error(`${id}: layer nesting exceeds 32`)
      if ((layer.at ?? 0) >= (layer.until ?? 1))
        throw new Error(`${id}: invalid layer interval`)
      if (layer.otherwise && !layer.when)
        throw new Error(`${id}: otherwise requires when`)
      if (layer.when?.phase && !layer.when.track)
        throw new Error(`${id}: phase requires track`)
      check(layer.properties)
      checkTypes(layer.properties)
      check(layer.when)
      checkTypes(layer.when)
      let cost = 1
      if ('frame' in layer.source) {
        const frame = skin.frames[layer.source.frame]
        if (!frame)
          throw new Error(`${id}: unknown frame "${layer.source.frame}"`)
        for (const key of Object.keys(layer.properties ?? {})) {
          if (!['opacity', 'transform', ...propertyNames[frame.type]].includes(key))
            throw new Error(`${id}: property "${key}" is invalid on ${frame.type}`)
        }
        if (layer.layers && frame.type !== 'group')
          throw new Error(`${id}: only group frames accept child layers`)
        const merged = { ...frame, ...layer.properties }
        if ((frame.type === 'arc' || frame.type === 'line' || frame.type === 'ring') && (!merged.stroke || (merged.strokeWidth === undefined && frame.type !== 'ring')))
          throw new Error(`${id}: ${frame.type} requires stroke and strokeWidth`)
        cost += frameCost(frame)
      }
      else {
        if (layer.layers)
          throw new Error(`${id}: animation references cannot append child layers`)
        for (const key of Object.keys(layer.properties ?? {})) {
          if (key !== 'opacity' && key !== 'transform')
            throw new Error(`${id}: animation instances only accept opacity and transform`)
        }
        check(layer.source.sample)
        cost += visit(layer.source.animation, depth + 1)
        height = Math.max(height, 1 + heights.get(layer.source.animation)!)
        if (height > 32)
          throw new Error(`${id}: animation reference depth exceeds 32`)
        for (const input of inputs.get(layer.source.animation)!) required.add(input)
      }
      for (const child of layer.layers ?? []) cost += layerCost(child, nesting + 1)
      if (layer.otherwise)
        cost += layerCost(layer.otherwise, nesting + 1)
      if (cost > MAX_NODES)
        throw new Error(`${id}: expanded node budget exceeded`)
      return cost
    }
    const cost = 1 + animation.layers.reduce((n, layer) => n + layerCost(layer, 0), 0)
    if (cost > MAX_NODES)
      throw new Error(`${id}: expanded node budget exceeded`)
    active.delete(id)
    costs.set(id, cost)
    heights.set(id, height)
    inputs.set(id, required)
    return cost
  }
  for (const id of Object.keys(skin.animations)) visit(id)
  for (const [name, slot] of Object.entries(skin.slots)) {
    const contract = slotRegistry.get(name)
    if (!contract)
      throw new Error(`unknown slot "${name}"`)
    if (!Object.hasOwn(skin.animations, slot.animation))
      throw new Error(`${name}: unknown animation "${slot.animation}"`)
    for (const input of inputs.get(slot.animation)!) {
      const allowed = COMMON.has(input)
        || ((contract.kind === 'hold' || contract.kind === 'long-hold') && HOLD.has(input))
        || (contract.kind === 'flick' && FLICK.has(input))
        || (contract.path === 'exit' && input === 'exitRewindEnd')
      const bodyInput = contract.path === 'body' && (BODY.has(input)
        || (contract.kind === 'hold' && input === 'length')
        || (contract.kind === 'long-hold' && ['top', 'bottom', 'collapse'].includes(input)))
      if (!allowed && !bodyInput)
        throw new Error(`${name}: input "${input}" is not available`)
    }
  }
  return inputs
}
