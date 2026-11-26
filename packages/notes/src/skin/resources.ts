/** Prepare PNG resources before synchronous animation sampling and rendering. */
import type { Frame, Skin } from './schema'
import { parseSkin } from './schema'
import { validateSkin } from './validate'

const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_TOTAL_BYTES = 128 * 1024 * 1024

export class SkinImage {
  private cleanups: (() => void)[] = []
  disposed = false

  constructor(readonly src: string, readonly width: number, readonly height: number, readonly source?: CanvasImageSource) {}

  onDispose(cleanup: () => void): void {
    if (this.disposed)
      cleanup()
    else this.cleanups.push(cleanup)
  }

  dispose(): void {
    if (this.disposed)
      return
    this.disposed = true
    for (const cleanup of this.cleanups) cleanup()
    this.cleanups = []
    if (this.source && 'close' in this.source)
      this.source.close()
  }
}

export class LoadedSkin {
  constructor(readonly document: Skin, readonly images: ReadonlyMap<string, SkinImage>) {}

  dispose(): void {
    for (const image of new Set(this.images.values())) image.dispose()
  }
}

export interface SkinResourceOptions {
  /** Absolute URL of the skin JSON, for browser relative-path loading. */
  baseURL?: string | URL
  /** Resolve a validated relative PNG path. Node/ZIP consumers supply this. */
  resolve?: (path: string) => Promise<Uint8Array>
  /** Optional platform decoder; browsers decode automatically. */
  decode?: (png: Uint8Array, dataURL: string) => Promise<CanvasImageSource>
}

function pngSize(bytes: Uint8Array): [number, number] {
  if (bytes.byteLength < 45 || bytes.byteLength > MAX_IMAGE_BYTES
    || [137, 80, 78, 71, 13, 10, 26, 10].some((b, i) => bytes[i] !== b)) {
    throw new Error('invalid PNG or image byte budget exceeded')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452)
    throw new Error('PNG requires an IHDR header')
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  if (!width || !height || width * height > 16_777_216)
    throw new Error('PNG pixel budget exceeded')
  let offset = 8
  let hasData = false
  let ended = false
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const type = view.getUint32(offset + 4)
    if (offset + 12 + length > bytes.length)
      throw new Error('truncated PNG chunk')
    if (type === 0x49444154)
      hasData = true
    offset += 12 + length
    if (type === 0x49454E44) {
      ended = length === 0 && offset === bytes.length
      break
    }
  }
  if (!hasData || !ended)
    throw new Error('PNG requires image data and an IEND trailer')
  return [width, height]
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return `data:image/png;base64,${btoa(binary)}`
}

async function browserDecode(bytes: Uint8Array, src: string): Promise<CanvasImageSource | undefined> {
  if (typeof createImageBitmap !== 'undefined')
    return createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
  if (typeof Image !== 'undefined') {
    const image = new Image()
    image.src = src
    await image.decode()
    return image
  }
}

/** Load all image frames, including nested/unused frames; no I/O is done during draw. */
export async function loadSkinResources(json: unknown, options: SkinResourceOptions = {}): Promise<LoadedSkin> {
  const skin = parseSkin(json)
  validateSkin(skin)
  const paths = new Set<string>()
  const visit = (frame: Frame): void => {
    if (frame.type === 'image')
      paths.add(frame.src)
    else if (frame.type === 'group')
      frame.children?.forEach(visit)
  }
  Object.values(skin.frames).forEach(visit)
  const images = new Map<string, SkinImage>()
  let total = 0
  try {
    // Bound in-flight allocations; repeated paths share one decoded resource.
    for (const path of paths) {
      let bytes: Uint8Array
      if (path.startsWith('data:')) {
        const binary = atob(path.slice(path.indexOf(',') + 1))
        bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
      }
      else if (options.resolve) {
        bytes = await options.resolve(path)
      }
      else if (options.baseURL) {
        const response = await fetch(new URL(path, options.baseURL))
        if (!response.ok)
          throw new Error(`image request failed (${response.status}): ${path}`)
        const length = Number(response.headers.get('content-length'))
        if (length > MAX_IMAGE_BYTES)
          throw new Error('image byte budget exceeded')
        bytes = new Uint8Array(await response.arrayBuffer())
      }
      else {
        throw new Error(`image "${path}" needs a relative-path resolver or baseURL`)
      }
      total += bytes.byteLength
      if (total > MAX_TOTAL_BYTES)
        throw new Error('skin image byte budget exceeded')
      const [width, height] = pngSize(bytes)
      const src = encode(bytes)
      const source = options.decode ? await options.decode(bytes, src) : await browserDecode(bytes, src)
      images.set(path, new SkinImage(src, width, height, source))
    }
    return new LoadedSkin(skin, images)
  }
  catch (error) {
    for (const image of images.values()) image.dispose()
    throw error
  }
}
