/** Node resource adapter; the core compiler has no filesystem dependency. */
import { readFile, realpath } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { loadSkinResources } from '@cytoid/notes'

export async function loadSkinFile(filename: string) {
  const file = await realpath(filename)
  const root = dirname(file)
  const document = JSON.parse(await readFile(file, 'utf8'))
  return loadSkinResources(document, {
    resolve: async (src) => {
      const target = await realpath(resolve(root, src))
      const path = relative(root, target)
      if (isAbsolute(path) || path === '..' || path.startsWith(`..${sep}`))
        throw new Error(`skin image is outside the skin directory: ${src}`)
      return new Uint8Array(await readFile(target))
    },
  })
}
