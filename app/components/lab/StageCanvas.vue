<script setup lang="ts">
import type { Tick } from '../../composables/useRaf'
import { onMounted, onUnmounted, ref } from 'vue'
import { useRaf } from '../../composables/useRaf'

export interface CanvasFrame extends Tick {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}
const props = defineProps<{
  paint: (frame: CanvasFrame) => void
  label?: string
}>()
const canvas = ref<HTMLCanvasElement>()
let ctx: CanvasRenderingContext2D | null = null
let observer: ResizeObserver | undefined
let width = 0
let height = 0
let ratio = 0
function resize() {
  if (!canvas.value)
    return
  const rect = canvas.value.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  if (width === rect.width && height === rect.height && ratio === dpr)
    return
  width = rect.width
  height = rect.height
  ratio = dpr
  canvas.value.width = Math.round(width * ratio)
  canvas.value.height = Math.round(height * ratio)
}
onMounted(() => {
  ctx = canvas.value!.getContext('2d')
  observer = new ResizeObserver(resize)
  observer.observe(canvas.value!)
  resize()
})
onUnmounted(() => observer?.disconnect())
useRaf((tick) => {
  if (!ctx || !width || !height)
    return
  if (ratio !== window.devicePixelRatio)
    resize()
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)
  ctx.save()
  props.paint({ ...tick, ctx, width, height })
  ctx.restore()
})
</script>

<template>
  <!-- absolute positioning: the canvas's intrinsic size (its width/height
    attrs, which resize() keeps rewriting) must not feed back into the layout
    it is measured against, or the stage grows on every resize -->
  <canvas
    ref="canvas"
    class="absolute inset-0 block w-full h-full"
    :aria-label="label || 'Note animation preview'"
    role="img"
  />
</template>
