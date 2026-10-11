<script setup lang="ts">
import type { NoteKind } from '@cytoid/notes'
import type { CanvasFrame } from './StageCanvas.vue'
import { createContext, designs, drawScene, group, holdBody, longHoldBody, renderNote } from '@cytoid/notes'
import { computed, ref } from 'vue'
import { drawScanline, paintDragChain } from '~/utils/drag-chain'
import { DEMO_HOLD_SECONDS, lifecycle } from '../../composables/clips'
import { palette } from '../../composables/usePalette'
import StageCanvas from './StageCanvas.vue'

const tabs: { label: string, kind: NoteKind }[] = [
  { label: 'Click', kind: 'click' },
  { label: 'Hold', kind: 'hold' },
  { label: 'Drag', kind: 'drag-child' },
  { label: 'Flick', kind: 'flick' },
  { label: 'Drop click', kind: 'drop-click' },
]
const tabItems = tabs.map(t => ({ label: t.label, value: t.kind }))
const active = ref(tabs[0]!.kind)
const kind = computed(() => active.value as NoteKind)
let elapsed = 0

function paint({ ctx, width, height, dt }: CanvasFrame) {
  elapsed += dt
  if (kind.value === 'drag-child') {
    paintDragChain(ctx, {
      width,
      height,
      elapsed,
      kind: 'drag-child',
      direction: 'up',
      grade: 'perfect',
      scale: 0.9,
      judgement: true,
      palette: palette.value,
    })
    return
  }

  const grade = 'perfect' as const
  const direction = 'up' as const
  const { state, t, span } = lifecycle(kind.value, elapsed, grade)
  const dc = createContext(kind.value, { palette: palette.value, direction, scale: 0.9 })
  const hold = designs[kind.value].hold
  // hold bodies extend upward (up direction), so the origin shifts down —
  // nudged further than the gallery cards since this stage is taller
  ctx.translate(width / 2, height / 2 + (hold ? 64 : 0))
  const drop = kind.value.startsWith('drop-')
  // the stage is taller than the gallery cards — stretch the hold body to fill
  const bodyLength = height * 0.55
  const anchor = hold ? (kind.value === 'hold' ? -bodyLength : -height * 0.325) : 0
  const near = height / 2 - (hold ? 64 : 0)
  const scanY = drop ? 0 : near + ((anchor - near) / (hold ? span : 1.5)) * t
  const onStage = Math.abs(scanY) <= height / 2 + (hold ? 64 : 0)
  if (!state) {
    if (onStage)
      drawScanline(ctx, width, scanY)
    return
  }
  if (hold && (state.phase === 'enter' || state.phase === 'holding')) {
    const progress = state.phase === 'holding' ? state.progress : 0
    const appear = state.phase === 'enter' ? state.p : 1
    drawScene(ctx, kind.value === 'hold' ? holdBody({ length: bodyLength, progress, appear, t: elapsed }, dc) : longHoldBody({ top: height, bottom: height, progress, appear, t: state.phase === 'holding' ? state.t : 0, holdDuration: DEMO_HOLD_SECONDS }, dc))
  }
  const fall = drop && state.phase === 'enter' ? -(1 - t / 1.5) * height * 0.35 : 0
  const fx = renderNote(kind.value, state, dc, { judgement: true })
  const fy = (hold && state.phase === 'clear' ? anchor : 0) + fall
  drawScene(ctx, fy ? group([fx], { transform: { y: fy } }) : fx)
  if (onStage)
    drawScanline(ctx, width, scanY)
}
</script>

<template>
  <div>
    <UTabs
      v-model="active"
      :items="tabItems"
      :content="false"
      size="sm"
      class="mb-4"
    />
    <div class="rounded-2xl border border-default bg-[#16171d] overflow-hidden shadow-2xl shadow-black/40">
      <div class="relative h-[360px]">
        <StageCanvas :paint="paint" :label="`${kind} note preview`" />
      </div>
    </div>
  </div>
</template>
