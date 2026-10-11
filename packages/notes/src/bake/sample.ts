import type { Clip } from '../notes/types'

/**
 * Frame sampling rules shared by the baker and by frame players.
 *
 *  normalized: N = round(duration·fps); frame i shows p = (i+1)/N
 *              → player: i = min(N−1, floor(p·N))   (Cylheim-compatible)
 *              The last frame is the exact hit-time pose.
 *  once:       N = ceil(duration·fps)+1; frame i shows t = i/fps (clamped)
 *  loop:       N = round(duration·fps); frame i shows t = i/N·duration
 *              → player: i = floor(t/duration·N) mod N
 *  progress:   N = progressFrames; frame i shows p = i/(N−1)
 *  static:     N = 1
 *              → player: i = round(p·(N−1))
 */
export function sampleTimes(clip: Clip, fps: number, progressFrames = 61): number[] {
  switch (clip.mode) {
    case 'normalized': {
      const n = Math.max(1, Math.round(clip.duration * fps))
      return Array.from({ length: n }, (_, i) => (i + 1) / n)
    }
    case 'once': {
      const n = Math.ceil(clip.duration * fps - 1e-6) + 1
      return Array.from({ length: n }, (_, i) => Math.min(clip.duration, i / fps))
    }
    case 'loop': {
      const n = Math.max(1, Math.round(clip.duration * fps))
      return Array.from({ length: n }, (_, i) => (i / n) * clip.duration)
    }
    case 'progress':
      return Array.from({ length: progressFrames }, (_, i) => i / (progressFrames - 1))
    case 'static':
      return [1]
  }
}

/** Frame index for a clip parameter — the inverse of `sampleTimes`. */
export function frameIndex(clip: Pick<Clip, 'mode' | 'duration'>, frames: number, x: number, fps: number): number {
  switch (clip.mode) {
    case 'normalized':
      return Math.max(0, Math.min(frames - 1, Math.floor(x * frames)))
    case 'once':
      return Math.max(0, Math.min(frames - 1, Math.round(x * fps)))
    case 'loop': {
      const u = ((x / clip.duration) % 1 + 1) % 1
      return Math.floor(u * frames) % frames
    }
    case 'progress':
      return Math.max(0, Math.min(frames - 1, Math.round(x * (frames - 1))))
    case 'static':
      return 0
  }
}
