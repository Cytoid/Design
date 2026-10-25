<script setup lang="ts">
import type { Direction, NoteKind, Timing } from '@cytoid/notes'
import { clipsOf } from '@cytoid/notes'
import { designs } from '@cytoid/skin-flat'
import { computed, ref } from 'vue'
import { clipMax } from '../../composables/clips'
import { review } from '../../composables/useReview'
import { useTransport } from '../../composables/useTransport'
import LabNoteCanvas from './NoteCanvas.vue'

const props = defineProps<{ kind: NoteKind }>()
const clipId = ref(designs[props.kind].enter.id)
const clips = computed(() => clipsOf(designs[props.kind]))
const clip = computed(() => clips.value.find(c => c.id === clipId.value) || clips.value[0]!)
const clipItems = computed(() => clips.value.map(c => ({ label: c.id, value: c.id })))
const { x, playing, loop, speed, step } = useTransport(clip)
const fps = ref(30)
const zoom = ref(1)
const onion = ref(false)
const showBounds = ref(false)
const compare = ref(false)
const filmstrip = ref(true)
const count = ref(9)
const samples = computed(() => Array.from({ length: count.value }, (_, i) => i / (count.value - 1) * clipMax(clip.value)))

const directions: { label: string, value: Direction }[] = [
  { label: 'up', value: 'up' },
  { label: 'down', value: 'down' },
]
const timingItems: { label: string, value: Timing }[] = [
  { label: 'Fast', value: 'fast' },
  { label: 'Slow', value: 'slow' },
]
const timing = computed(() => review.timing ? review.timingSide : null)
const fpsItems = [{ label: '30', value: 30 }, { label: '60', value: 60 }]
const speedItems = [0.25, 0.5, 1, 2].map(s => ({ label: `${s}×`, value: s }))
const countItems = [{ label: '5', value: 5 }, { label: '9', value: 9 }, { label: '13', value: 13 }]
const surfaceClass = computed(() => ({
  dark: 'bg-[#16171d]',
  light: 'bg-gray-200',
  checker: 'bg-[#252733] bg-[image:conic-gradient(#3a3e4c_25%,transparent_0_50%,#3a3e4c_0_75%,transparent_0)] bg-[size:24px_24px]',
}[review.background] ?? 'bg-[#16171d]'))
</script>

<template>
  <div>
    <div class="px-5 py-4 rounded-xl border border-default bg-elevated space-y-3.5">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Clip
          <USelect v-model="clipId" :items="clipItems" class="w-40" />
        </label>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Direction
          <USelect v-model="review.direction" :items="directions" class="w-24" />
        </label>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Zoom
          <USlider v-model="zoom" :min="1" :max="4" :step="0.25" class="w-24" />
          <span class="font-mono text-default">{{ zoom }}×</span>
        </label>
        <UCheckbox v-model="compare" label="Compare ↑ / ↓" />
        <UCheckbox v-model="review.judgement" label="Judgement text" />
        <UCheckbox v-model="review.timing" label="Fast / slow" />
        <USelect v-model="review.timingSide" :items="timingItems" :disabled="!review.timing" class="w-24" aria-label="Timing" />
      </div>

      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <UButton
          :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
          variant="solid"
          color="primary"
          @click="playing = !playing"
        >
          {{ playing ? 'Pause' : 'Play' }}
        </UButton>
        <UButton variant="ghost" icon="i-lucide-arrow-left" aria-label="Previous frame" @click="step(-1, fps)">
          Frame
        </UButton>
        <UButton variant="ghost" trailing-icon="i-lucide-arrow-right" @click="step(1, fps)">
          Frame
        </UButton>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Step FPS
          <USelect v-model="fps" :items="fpsItems" class="w-20" />
        </label>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Speed
          <USelect v-model="speed" :items="speedItems" class="w-20" />
        </label>
        <UCheckbox v-model="loop" label="Loop" />
        <span class="ml-auto font-mono text-primary text-xs">{{ x.toFixed(4) }}{{ clip.mode === 'once' || clip.mode === 'loop' ? ' s' : '' }}</span>
      </div>
      <input
        v-model.number="x"
        type="range"
        min="0"
        :max="clipMax(clip)"
        step="0.0001"
        aria-label="Clip timeline"
        class="w-full my-4 accent-primary cursor-pointer"
        @input="playing = false"
      >
      <div class="flex justify-between text-xs text-muted font-mono mb-4">
        <span>0</span>
        <span>{{ clip.mode }} · {{ clip.duration }}s nominal</span>
        <span>{{ clipMax(clip) }}</span>
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <UCheckbox v-model="onion" label="Onion skin ±2 frames" />
        <UCheckbox v-model="showBounds" label="Scene bounds" />
        <UCheckbox v-model="filmstrip" label="Filmstrip" />
        <label v-if="filmstrip" class="flex items-center gap-2.5 text-xs text-muted">
          Samples
          <USelect v-model="count" :items="countItems" class="w-20" />
        </label>
      </div>
    </div>

    <div class="mt-4 border border-default rounded-xl h-[470px] grid overflow-hidden" :class="[surfaceClass, compare ? 'grid-cols-2' : 'grid-cols-1']">
      <div class="relative min-w-0 overflow-hidden">
        <span class="absolute top-5 left-6 text-[10px] tracking-[1.5px] text-gray-400">{{ compare ? 'UP' : review.direction.toUpperCase() }} / LIVE VECTOR</span>
        <LabNoteCanvas :kind="kind" :direction="compare ? 'up' : review.direction" :clip="clip" :x="x" :scale="zoom" :onion="onion" :fps="fps" :show-bounds="showBounds" :judgement="review.judgement" :timing="timing" />
      </div>
      <div v-if="compare" class="relative min-w-0 overflow-hidden border-l border-default">
        <span class="absolute top-5 left-6 text-[10px] tracking-[1.5px] text-gray-400">DOWN / LIVE VECTOR</span>
        <LabNoteCanvas :kind="kind" direction="down" :clip="clip" :x="x" :scale="zoom" :onion="onion" :fps="fps" :show-bounds="showBounds" :judgement="review.judgement" :timing="timing" />
      </div>
    </div>

    <div
      v-if="filmstrip"
      class="grid gap-2 mt-4 overflow-x-auto"
      :style="{ gridTemplateColumns: `repeat(${count}, minmax(70px, 1fr))` }"
    >
      <button
        v-for="(sample, i) in samples"
        :key="i"
        class="relative h-[110px] overflow-hidden rounded-lg border border-default bg-[#16171d] cursor-pointer"
        :class="surfaceClass"
        :aria-label="`Seek to ${sample.toFixed(3)}`"
        @click="x = sample; playing = false"
      >
        <LabNoteCanvas :kind="kind" :direction="review.direction" :clip="clip" :x="sample" :scale="0.4" />
        <span class="absolute bottom-1.5 left-2 text-[10px] font-mono text-gray-400">{{ sample.toFixed(3) }}</span>
      </button>
    </div>

    <p v-if="clip.mode === 'progress'" class="text-xs text-muted leading-relaxed mt-4">
      The timeline drives gameplay progress, from 0 to 1.
    </p>
  </div>
</template>
