import type { SceneNode } from '@cytoid/notes'
import { Container, Graphics } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { SceneView } from '../src/pixi-render'

function circle(fill: string, r = 10): SceneNode {
  return { type: 'circle', r, fill }
}

describe('sceneView (pixi adapter)', () => {
  it('syncs a flat scene into display objects', () => {
    const view = new SceneView()
    view.setScene({
      type: 'group',
      children: [circle('#ff0000'), { type: 'line', x1: 0, y1: 0, x2: 5, y2: 5, stroke: '#fff' }],
    })
    expect(view.children.length).toBe(1) // the root group
    const inner = view.children[0] as Container
    expect(inner.children.length).toBe(2)
    expect(inner.children[0]).toBeInstanceOf(Graphics)
  })

  it('maps group transforms to the container', () => {
    const view = new SceneView()
    view.setScene({
      type: 'group',
      transform: { x: 10, y: 5, rotate: 0.5, scale: 2 },
      children: [circle('#fff')],
    })
    const inner = view.children[0] as Container
    expect(inner.x).toBe(10)
    expect(inner.y).toBe(5)
    expect(inner.rotation).toBeCloseTo(0.5)
    expect(inner.scale.x).toBe(2)
    expect(inner.scale.y).toBe(2)
  })

  it('separates scaleX/scaleY', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', transform: { scaleX: 2, scaleY: 0.5 }, children: [] })
    const inner = view.children[0] as Container
    expect(inner.scale.x).toBe(2)
    expect(inner.scale.y).toBe(0.5)
  })

  it('applies opacity and blend per node', () => {
    const view = new SceneView()
    view.setScene({
      type: 'group',
      opacity: 0.5,
      children: [{ ...circle('#fff'), opacity: 0.4, blend: 'add' }],
    })
    const inner = view.children[0] as Container
    expect(inner.alpha).toBeCloseTo(0.5)
    const gfx = inner.children[0] as Container
    expect(gfx.alpha).toBeCloseTo(0.4)
    expect(gfx.blendMode).toBe('add')
  })

  it('reuses Graphics when geometry is unchanged, still updating props', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', children: [circle('#ff0000')] })
    const gfx1 = (view.children[0] as Container).children[0]
    view.setScene({ type: 'group', children: [circle('#ff0000', 12)] }) // geometry changed → rebuild, same instance
    const gfx2 = (view.children[0] as Container).children[0]
    expect(gfx2).toBe(gfx1)
  })

  it('hides zero-opacity nodes but keeps structure', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', children: [{ ...circle('#fff'), opacity: 0 }] })
    const inner = view.children[0] as Container
    expect(inner.children[0]!.visible).toBe(false)
  })

  it('removes stale children on shrink', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', children: [circle('#fff'), circle('#fff'), circle('#fff')] })
    const inner = view.children[0] as Container
    expect(inner.children.length).toBe(3)
    view.setScene({ type: 'group', children: [circle('#fff')] })
    expect(inner.children.length).toBe(1)
    view.setScene(null)
    expect(view.children.length).toBe(0)
  })

  it('swaps display class when a primitive becomes a group', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', children: [circle('#fff')] })
    const gfx1 = (view.children[0] as Container).children[0]
    view.setScene({ type: 'group', children: [{ type: 'group', children: [circle('#fff')] }] })
    const child = (view.children[0] as Container).children[0]!
    expect(child).not.toBe(gfx1)
    expect(child).toBeInstanceOf(Container)
    expect(child.children.length).toBe(1)
  })

  it('nested groups survive repeated syncs', () => {
    const view = new SceneView()
    const scene: SceneNode = {
      type: 'group',
      transform: { x: 1 },
      children: [
        { type: 'group', transform: { y: 2 }, children: [circle('#fff')] },
        { type: 'line', x1: 0, y1: 0, x2: 1, y2: 1, stroke: '#fff' },
      ],
    }
    for (let i = 0; i < 3; i++) view.setScene(scene)
    const inner = view.children[0] as Container
    expect(inner.children.length).toBe(2)
    expect((inner.children[0] as Container).y).toBe(2)
  })

  it('fills clip masks and rebuilds them in place', () => {
    const view = new SceneView()
    const clip = { type: 'rect' as const, x: -10, y: -20, w: 20, h: 40, rx: 5 }
    view.setScene({ type: 'group', clip, children: [circle('#fff')] })
    const inner = view.children[0] as Container
    const mask = inner.mask as Graphics & { signatureKey?: string }
    // v8 renders Graphics masks through the graphics pipe — the shape must be
    // filled, or the stencil stays empty and the masked content disappears
    expect(mask.context.instructions.map(i => i.action)).toContain('fill')
    expect(mask.parent).toBe(inner)
    // a changed clip reuses the same Graphics (the hold body's clip moves each frame)
    view.setScene({ type: 'group', clip: { ...clip, h: 41 }, children: [circle('#fff')] })
    expect(inner.mask).toBe(mask)
    expect(mask.signatureKey).not.toBe(JSON.stringify(clip))
    // dropping the clip releases the mask
    view.setScene({ type: 'group', children: [circle('#fff')] })
    expect(inner.mask).toBeFalsy()
  })

  it('destroyView clears everything', () => {
    const view = new SceneView()
    view.setScene({ type: 'group', children: [circle('#fff')] })
    view.destroyView()
    expect(view.children.length).toBe(0)
  })
})
