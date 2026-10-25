<script setup lang="ts">
import type { NoteKind } from '@cytoid/notes'
import type { CanvasFrame } from './StageCanvas.vue'
import { drawScene, group, KIND_LABEL } from '@cytoid/notes'
import { createContext, designs, holdBody, holdBodyAlpha, longHoldBody, renderNote } from '@cytoid/skin-flat'
import { computed } from 'vue'
import { drawScanline, paintDragChain } from '~/utils/drag-chain'
import { DEMO_HOLD_SECONDS, lifecycle } from '../../composables/clips'
import { palette } from '../../composables/usePalette'
import { review } from '../../composables/useReview'
import NoteCanvas from './NoteCanvas.vue'
import StageCanvas from './StageCanvas.vue'

const props = defineProps<{
  kind: NoteKind
  index: number
}>()
let elapsed = 0

const surfaceClass = computed(() => ({
  dark: 'bg-[#16171d]',
  light: 'bg-gray-200',
  checker: 'bg-[#252733] bg-[image:conic-gradient(#3a3e4c_25%,transparent_0_50%,#3a3e4c_0_75%,transparent_0)] bg-[size:24px_24px]',
}[review.background] ?? 'bg-[#16171d]'))

function paint({ ctx, width, height, dt }: CanvasFrame) {
  if (review.playing)
    elapsed += dt * review.speed
  if (props.kind === 'drag-head' || props.kind === 'click-drag-head' || props.kind === 'drag-child' || props.kind === 'click-drag-child') {
    paintDragChain(ctx, {
      width,
      height,
      elapsed,
      kind: props.kind,
      direction: review.direction,
      grade: review.grade,
      scale: review.scale,
      judgement: review.judgement,
      timing: review.timing ? review.timingSide : null,
      palette: palette.value,
    })
    return
  }
  const { state, t } = lifecycle(props.kind, elapsed, review.grade, review.timingSide)
  const dc = createContext(props.kind, { palette: palette.value, direction: review.direction, scale: review.scale })
  const hold = designs[props.kind].hold
  const up = review.direction === 'up'
  ctx.translate(width / 2, height / 2 + (hold ? (up ? 36 : -36) : 0))
  // Virtual scanner (same recipe as the player: 1.5px line, 6px
  // caps flush with the card edges). It crosses every note exactly when it is
  // judged — the centre for taps, the end position for holds — then keeps
  // sweeping off the card; the hold burst plays at that crossing point. Drops
  // lock the line at their hit position instead and fall onto it from above.
  // Drawn last: the scanline rides on top of everything (Cytoid).
  const drop = props.kind.startsWith('drop-')
  const anchor = hold ? (props.kind === 'hold' ? (up ? -100 : 100) : (up ? -1 : 1) * height * 0.325) : 0
  const near = (up ? 1 : -1) * (height / 2 - (hold ? 36 : 0))
  // a missed hold never starts holding: keep the scanner on the full hold
  // timeline so it still crosses the head at the hit
  const scanY = drop ? 0 : near + ((anchor - near) / (hold ? 1.5 + DEMO_HOLD_SECONDS : 1.5)) * t
  const onCard = Math.abs(scanY) <= height / 2 + (hold ? 36 : 0)
  if (!state) {
    if (onCard)
      drawScanline(ctx, width, scanY)
    return
  }
  const bodyAlpha = hold ? holdBodyAlpha(props.kind, state) : 0
  if (hold && bodyAlpha > 0.001) {
    const progress = state.phase === 'holding' ? state.progress : 0
    const appear = state.phase === 'enter' ? state.p : 1
    const body = props.kind === 'hold' ? holdBody({ length: 100, progress, appear, t: state.phase === 'holding' ? state.t : 0 }, dc) : longHoldBody({ top: height, bottom: height, progress, appear, t: state.phase === 'holding' ? state.t : 0, holdDuration: DEMO_HOLD_SECONDS }, dc)
    // on the exit the body fades on its own, faster curve
    drawScene(ctx, bodyAlpha < 0.999 ? group([body], { opacity: bodyAlpha, isolate: true }) : body)
  }

  // Hold clears play where the scanline is the moment the hold ends:
  // the body end for holds, a representative line position for the full-height
  // pillar — exactly where the virtual scanner crosses at the end of holding.
  // Drops fall from above onto the locked line, landing when the approach ends.
  const fall = drop && state.phase === 'enter' ? -(1 - t / 1.5) * height * 0.35 : 0
  const fx = renderNote(props.kind, state, dc, { judgement: review.judgement, timing: review.timing })
  const fy = (hold && state.phase === 'clear' ? anchor : 0) + fall
  drawScene(ctx, fy ? group([fx], { transform: { y: fy } }) : fx)
  if (onCard)
    drawScanline(ctx, width, scanY)
}
</script>

<template>
  <article class="border border-default rounded-xl overflow-hidden bg-elevated">
    <header class="flex items-center gap-2.5 px-4.5 py-4">
      <span class="font-mono text-xs text-muted">{{ String(index + 1).padStart(2, '0') }}</span>
      <h3 class="text-sm flex-1 text-default">
        {{ KIND_LABEL[kind] }}
      </h3>
    </header>
    <div class="h-[230px] grid grid-cols-[1fr_100px] border-y border-default" :class="surfaceClass">
      <div class="relative min-w-0">
        <StageCanvas :paint="paint" :label="`${kind} full lifecycle`" />
        <span class="absolute bottom-3 left-3.5 text-[9px] tracking-[1.4px] text-gray-400">ANIMATION</span>
      </div>
      <div class="relative min-w-0 border-l border-default/25">
        <NoteCanvas :kind="kind" :direction="review.direction" :state="{ phase: 'enter', p: 1 }" :scale="review.scale * 0.55" />
        <span class="absolute bottom-3 left-3.5 text-[9px] tracking-[1.4px] text-gray-400">READY</span>
      </div>
    </div>
  </article>
</template>
