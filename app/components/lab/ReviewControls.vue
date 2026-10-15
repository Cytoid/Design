<script setup lang="ts">
import type { Direction, Timing } from '@cytoid/notes'
import { GRADES } from '@cytoid/notes'
import { review } from '../../composables/useReview'

const directions: { label: string, value: Direction }[] = [
  { label: '↑ Up', value: 'up' },
  { label: '↓ Down', value: 'down' },
]
const speeds = [0.25, 0.5, 0.75, 1, 1.5, 2].map(s => ({ label: `${s}×`, value: s }))
const grades = GRADES.map(g => ({ label: g, value: g }))
const timings: { label: string, value: Timing }[] = [
  { label: 'Fast', value: 'fast' },
  { label: 'Slow', value: 'slow' },
]
const surfaces: { label: string, value: string }[] = [
  { label: 'Dark stage', value: 'dark' },
  { label: 'Light', value: 'light' },
  { label: 'Checker', value: 'checker' },
]
</script>

<template>
  <div class="flex flex-wrap items-center gap-x-5 gap-y-3 mb-6">
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Direction
      <USelect v-model="review.direction" :items="directions" class="w-28" />
    </label>
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Speed
      <USelect v-model="review.speed" :items="speeds" class="w-20" />
    </label>
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Judgement
      <USelect v-model="review.grade" :items="grades" class="w-32" />
    </label>
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Surface
      <USelect v-model="review.background" :items="surfaces" class="w-36" />
    </label>
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Note scale
      <USlider v-model="review.scale" :min="0.35" :max="1.2" :step="0.05" class="w-24" />
      <span class="font-mono tabular-nums text-default">{{ review.scale.toFixed(2) }}×</span>
    </label>
    <UCheckbox v-model="review.judgement" label="Judgement text" />
    <UCheckbox v-model="review.timing" label="Fast / slow" />
    <label class="flex items-center gap-2.5 text-xs text-muted">
      Timing
      <USelect v-model="review.timingSide" :items="timings" :disabled="!review.timing" class="w-24" />
    </label>
    <UButton
      :icon="review.playing ? 'i-lucide-pause' : 'i-lucide-play'"
      variant="soft"
      @click="review.playing = !review.playing"
    >
      {{ review.playing ? 'Pause' : 'Play' }}
    </UButton>
  </div>
</template>
