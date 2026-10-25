/** Native authoring helpers with no dependency on a particular design. */
import type { SkinAnimation as Animation, SkinFrame as Frame, SkinGate as Gate, SkinLayer as Layer, SkinProperties as Properties, Skin } from '@cytoid/notes'

type Bindings<T> = T extends unknown ? { [K in keyof T]: K extends keyof Properties ? Exclude<Properties[K], undefined> : T[K] } : never
type Primitive = Bindings<Exclude<Frame, { type: 'group' }>> | (Omit<Bindings<Extract<Frame, { type: 'group' }>>, 'children'> & { children?: Primitive[] })

export type Shape = Primitive extends infer T ? T extends { type: 'group' }
  ? Omit<T, 'children'> & { children?: Shape[], when?: Gate }
  : T & { when?: Gate } : never
export type AnimationDraft = Omit<Animation, 'layers'> & { note?: string, layers: (Shape | Layer)[] }

function constant(value: unknown): boolean {
  if (!value || typeof value !== 'object')
    return true
  if (['track', 'input', 'lerp', 'add', 'multiply', 'clamp'].some(key => Object.hasOwn(value, key)))
    return false
  return Object.values(value).every(constant)
}

export class SkinBuilder {
  private frames = new Map<string, string>()
  private animations = new Map<string, string>()
  private document: Skin

  constructor(id: string, name: string, meta?: Skin['meta']) {
    this.document = { schemaVersion: 2, id, name, ...(meta ? { meta } : {}), frames: {}, animations: {}, slots: {} }
  }

  private layer(shape: Shape | Layer): Layer {
    if ('source' in shape)
      return shape
    const frame: Record<string, unknown> = { type: shape.type }
    const properties: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(shape)) {
      if (key === 'type' || key === 'children' || key === 'when')
        continue
      if (constant(value)) {
        frame[key] = value
      }
      else {
        // Required geometry fields retain a static placeholder; instance bindings override it.
        if (key === 'points')
          frame[key] = []
        else if (key !== 'fill' && key !== 'stroke' && key !== 'transform' && key !== 'clip')
          frame[key] = 0
        properties[key] = value
      }
    }
    const serialized = JSON.stringify(frame)
    let id = this.frames.get(serialized)
    if (!id) {
      id = `frame${this.frames.size}`
      this.frames.set(serialized, id)
      this.document.frames[id] = frame as unknown as Frame
    }
    return {
      source: { frame: id },
      ...(Object.keys(properties).length ? { properties } : {}),
      ...(shape.type === 'group' ? { layers: (shape.children ?? []).map(child => this.layer(child)) } : {}),
      ...(shape.when ? { when: shape.when } : {}),
    }
  }

  bind(slot: string, draft: AnimationDraft): string {
    if (Object.hasOwn(this.document.slots, slot))
      throw new Error(`duplicate slot ${slot}`)
    const { note, layers, ...fields } = draft
    const animation: Animation = { layers: layers.map(shape => this.layer(shape)), ...fields }
    const serialized = JSON.stringify(animation)
    let id = this.animations.get(serialized)
    if (!id) {
      id = `animation${this.animations.size}`
      this.animations.set(serialized, id)
      this.document.animations[id] = animation
    }
    this.document.slots[slot] = { animation: id, ...(note ? { note } : {}) }
    return id
  }

  build(): Skin { return this.document }
}
