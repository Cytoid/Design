import { parseSkin } from '@cytoid/notes'
import { describe, expect, it } from 'vitest'
import { SkinBuilder } from '../src/authoring'

// Authoring must remain usable without any concrete skin package.
describe('skin authoring', () => {
  it('interns frames and animations independently from their slot bindings', () => {
    const builder = new SkinBuilder('test', 'Test')
    const draft = { layers: [{ type: 'circle' as const, r: { input: 'R' as const }, fill: '#ffffff' as const }] }
    const first = builder.bind('click:enter', draft)
    const second = builder.bind('hold:enter', draft)
    const skin = parseSkin(builder.build())
    expect(first).toBe(second)
    expect(Object.keys(skin.frames)).toHaveLength(1)
    expect(Object.keys(skin.animations)).toHaveLength(1)
    expect(skin.animations[first]!.type === 'layers' && skin.animations[first]!.layers[0]!.properties).toEqual({ r: { input: 'R' } })
  })

  it('rejects duplicate slot definitions', () => {
    const builder = new SkinBuilder('test', 'Test')
    builder.bind('click:enter', { layers: [] })
    expect(() => builder.bind('click:enter', { layers: [] })).toThrow(/duplicate slot/)
  })
})
