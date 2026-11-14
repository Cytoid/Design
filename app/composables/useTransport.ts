import type { Clip } from '@cytoid/notes'
import type { Ref } from 'vue'
import { ref, watch } from 'vue'
import { clipMax } from './clips'
import { useRaf } from './useRaf'

export function useTransport(clip: Ref<Pick<Clip, 'mode' | 'duration'>>) {
  const x = ref(0)
  const playing = ref(true)
  const loop = ref(true)
  const speed = ref(1)
  watch(clip, () => {
    x.value = 0
  })
  useRaf(({ dt }) => {
    if (!playing.value)
      return
    const max = clipMax(clip.value)
    // Frozen loops (`period: 0`) have no timeline — advancing would be 0 / 0.
    if (!(max > 0 && clip.value.duration > 0))
      return
    const next = x.value + dt * speed.value * max / clip.value.duration
    if (next >= max) {
      x.value = loop.value ? next % max : max
      if (!loop.value)
        playing.value = false
    }
    else {
      x.value = next
    }
  })
  function step(delta: number, fps: number) {
    playing.value = false
    const max = clipMax(clip.value)
    const duration = clip.value.duration
    if (!(max > 0 && duration > 0 && fps > 0))
      return
    x.value = Math.max(0, Math.min(max, x.value + delta * max / (duration * fps)))
  }
  return { x, playing, loop, speed, step }
}
