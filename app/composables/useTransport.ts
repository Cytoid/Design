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
    x.value = Math.max(0, Math.min(clipMax(clip.value), x.value + delta * clipMax(clip.value) / (clip.value.duration * fps)))
  }
  return { x, playing, loop, speed, step }
}
