import type { Skin } from '@cytoid/notes'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileAnimation, derivePalette, loadSkinResources } from '@cytoid/notes'
import { describe, expect, it } from 'vitest'
import { loadSkinFile, rasterize } from '../src'
import { SkinBuilder } from '../src/authoring'

const fixture = new URL('../../notes/test/fixtures/red.png', import.meta.url)
function skin(): Skin {
  return {
    schemaVersion: 2,
    id: 'images',
    name: 'Images',
    frames: { red: { type: 'image', src: 'assets/red.png', x: -4, y: -4, w: 8, h: 8 } },
    animations: { image: { type: 'sequence', fps: 30, frames: ['red'] } },
    slots: {},
  }
}
const palette = derivePalette(0, { chroma: 0 })
const grades = { perfect: '#fff', great: '#fff', good: '#fff', bad: '#fff', miss: '#fff' }
const ctx = { kind: 'click' as const, palette, colors: { note: () => palette, family: () => palette, grade: grades, ring: '#fff' }, grades, direction: 'up' as const, bodyDirection: 'up' as const, heading: 0, approach: 1, unit: 128, size: 128, ringStroke: 10, hairStroke: 2 }

describe('node image resources and baking', () => {
  it('loads paths relative to the manifest and bakes embedded images with alpha', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-images-'))
    try {
      await mkdir(join(root, 'assets'))
      await writeFile(join(root, 'assets/red.png'), await readFile(fixture))
      const document = skin()
      document.frames.red!.opacity = 0.5
      await writeFile(join(root, 'skin.json'), JSON.stringify(document))
      const loaded = await loadSkinFile(join(root, 'skin.json'))
      try {
        const node = compileAnimation(loaded, 'image')(0.9, ctx)
        const actual = rasterize(node, 8, 8, 4, 4)
        const expected = rasterize({ type: 'rect', x: -4, y: -4, w: 8, h: 8, fill: '#ff0000', opacity: 0.5 }, 8, 8, 4, 4)
        expect(actual).toEqual(expected)
      }
      finally { loaded.dispose() }
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('bakes image frame changes and holds an authored transparent final frame', async () => {
    const document = skin()
    for (const name of ['red', 'blue', 'transparent']) {
      document.frames[name] = { type: 'image', src: `${name}.png`, x: -4, y: -4, w: 8, h: 8 }
    }
    document.animations.image = { type: 'sequence', fps: 2, frames: ['red', 'blue', 'transparent'] }
    const loaded = await loadSkinResources(document, { resolve: async src => readFile(new URL(`../../notes/test/fixtures/${src}`, import.meta.url)) })
    try {
      const draw = compileAnimation(loaded, 'image')
      for (const [elapsed, fill] of [[0, '#ff0000'], [0.5, '#0000ff'], [1, undefined], [1.8, undefined]] as const) {
        const actual = rasterize(draw(elapsed / 2, ctx, { elapsed, duration: 2 }), 8, 8, 4, 4)
        const expected = rasterize(fill ? { type: 'rect', x: -4, y: -4, w: 8, h: 8, fill } : { type: 'group', children: [] }, 8, 8, 4, 4)
        expect(actual).toEqual(expected)
      }
    }
    finally { loaded.dispose() }
  })

  it('rejects symlinks that leave the skin resource directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-images-'))
    try {
      await mkdir(join(root, 'skin/assets'), { recursive: true })
      await writeFile(join(root, 'outside.png'), await readFile(fixture))
      await symlink(join(root, 'outside.png'), join(root, 'skin/assets/red.png'))
      await writeFile(join(root, 'skin/skin.json'), JSON.stringify(skin()))
      await expect(loadSkinFile(join(root, 'skin/skin.json'))).rejects.toThrow(/outside/)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })

  it('authors reusable image frames and sequences without replacing interned assets', () => {
    const builder = new SkinBuilder('images', 'Images')
    builder.frame('frame0', { type: 'image', src: 'assets/red.png', x: 0, y: 0, w: 128, h: 128 })
    const sequence = builder.sequence('spark', { fps: 30, frames: ['frame0'] })
    builder.bind('click:clear:perfect', { layers: [{ source: { animation: sequence } }] })
    builder.bind('click:enter', { layers: [{ type: 'circle', r: 4, fill: '#fff' }] })
    expect(builder.build().frames.frame0!.type).toBe('image')
    expect(builder.build().frames.frame1!.type).toBe('circle')
    expect(builder.build().animations.spark).toMatchObject({ type: 'sequence', fps: 30, frames: ['frame0'] })
  })
})
