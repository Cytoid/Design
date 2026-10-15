<script setup lang="ts">
import type { Palette } from '@cytoid/notes'
import type { LoadedLevel, ParsedChart } from '@cytoid/player'
import { loadLevelFromUrl, loadLevelFromZip, parseChart, Player } from '@cytoid/player'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { palette as reviewPalette } from '../../composables/usePalette'

const hostEl = ref<HTMLElement | null>(null)
const level = ref<LoadedLevel | null>(null)
const current = ref(-1)
const loading = ref(false)
const error = ref('')
const playing = ref(false)
const time = ref(0)
const duration = ref(0)
const scale = ref(0.85)
const speed = ref(1)
const offsetMs = ref(0)
const judgement = ref(true)
const timing = ref(true)
const playMode = ref(false)
/** Cytoid game mode: ranked / practice judgement windows (same 0.3 s miss deadline) */
const judgeMode = ref<'ranked' | 'practice'>('ranked')
const judgeModeItems = [{ label: 'Ranked', value: 'ranked' }, { label: 'Practice', value: 'practice' }]
const stats = ref<{ combo: number, maxCombo: number, perfect: number, great: number, good: number, bad: number, miss: number, judged: number, fast: number, slow: number } | null>(null)
const dragging = ref(false)
const isDemo = ref(false)

let player: Player | null = null
let uiTimer = 0

const difficulty = computed(() => (level.value && current.value >= 0 ? level.value.difficulties[current.value] : null))

const speedItems = [0.25, 0.5, 0.75, 1, 1.5, 2].map(s => ({ label: `${s}×`, value: s }))

function fmt(t: number) {
  const s = Math.max(0, Math.floor(t))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

async function mount() {
  if (!hostEl.value || player)
    return
  player = new Player({
    palette: reviewPalette.value,
    scale: scale.value,
    judgement: judgement.value,
    timing: timing.value,
    deviceOffset: offsetMs.value / 1000,
    rate: speed.value,
    playMode: playMode.value,
    judgeMode: judgeMode.value,
  })
  await player.attach(hostEl.value)
  uiTimer = window.setInterval(() => {
    if (!player || dragging.value)
      return
    time.value = player.time
    if (player.playing !== playing.value)
      playing.value = player.playing
    const d = player.duration
    if (d > 0 && Math.abs(d - duration.value) > 0.25)
      duration.value = d
    if (player.playMode) {
      const s = player.stats
      if (s && s.judged !== stats.value?.judged)
        stats.value = { ...s }
    }
    else if (stats.value) {
      stats.value = null
    }
  }, 1000 / 30)
}

onMounted(mount)
onUnmounted(() => {
  window.clearInterval(uiTimer)
  player?.destroy()
  player = null
})

watch(reviewPalette, (p: Palette) => player?.setPalette(p))
watch([scale, judgement, timing], () => player?.updateOptions({ scale: scale.value, judgement: judgement.value, timing: timing.value }))
watch(playMode, () => {
  stats.value = null
  player?.updateOptions({ playMode: playMode.value })
})
watch(judgeMode, () => player?.updateOptions({ judgeMode: judgeMode.value }))
watch(speed, () => {
  player?.updateOptions({ rate: speed.value })
  if (playing.value)
    player?.play(player.time)
})
watch(offsetMs, () => player?.updateOptions({ deviceOffset: offsetMs.value / 1000 }))

// import.meta.env.BASE_URL is Nuxt's build assets dir (/_nuxt/), not the
// router base — resolve demo levels against the app base instead
const DEMO_LEVEL = `${useRuntimeConfig().app.baseURL}level/teages.yunomi.yumeiroparedo/`

async function loadDemo() {
  error.value = ''
  loading.value = true
  try {
    const loaded = await loadLevelFromUrl(DEMO_LEVEL)
    level.value = loaded
    current.value = playableIndex(loaded)
    isDemo.value = true
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    level.value = null
    isDemo.value = false
  }
  finally {
    loading.value = false
  }
}

async function load(file: File) {
  error.value = ''
  loading.value = true
  try {
    const loaded = await loadLevelFromZip(file)
    level.value = loaded
    current.value = playableIndex(loaded)
    if (current.value < 0)
      error.value = loaded.difficulties.some(d => d.legacy) ? 'Only legacy C1 charts found (converter not ported yet).' : 'No playable chart in this level.'
  }
  catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    level.value = null
  }
  finally {
    loading.value = false
    isDemo.value = false
  }
}

const uploadedFile = ref<File | null>(null)
watch(uploadedFile, (file) => {
  if (file) {
    void load(file)
    // reset so picking the same file again still fires
    uploadedFile.value = null
  }
})

function playableIndex(loaded: LoadedLevel) {
  return loaded.difficulties.findIndex(d => d.chart != null)
}

watch(current, () => {
  const d = difficulty.value
  if (!player || !d?.chart)
    return
  const parsed: ParsedChart = parseChart(d.chart)
  player.load(d.chart, d.audio)
  duration.value = player.duration
  player.seek(0)
  void parsed
})

function toggle() {
  if (!player || !difficulty.value?.chart)
    return
  if (player.playing) {
    player.pause()
    playing.value = false
  }
  else {
    if (player.time >= duration.value - 0.05)
      player.seek(0)
    player.play()
    playing.value = true
  }
}

function onTimeline(e: Event) {
  if (!player)
    return
  const v = Number((e.target as HTMLInputElement).value)
  time.value = v
  player.seek(v)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (file)
    void load(file)
}

const activePointers = new Map<number, { x: number, y: number }>()
function toLocal(e: PointerEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
function onDown(e: PointerEvent) {
  if (!player?.playMode || !playing.value)
    return
  const p = toLocal(e)
  activePointers.set(e.pointerId, p)
  player.press(p.x, p.y, e.pointerId)
}
function onMove(e: PointerEvent) {
  if (!player)
    return
  const p = toLocal(e)
  if (activePointers.has(e.pointerId))
    activePointers.set(e.pointerId, p)
  player.move(p.x, p.y, e.pointerId)
}
function onUp(e: PointerEvent) {
  if (!player || !activePointers.has(e.pointerId))
    return
  activePointers.delete(e.pointerId)
  player.release(e.pointerId)
}
</script>

<template>
  <div>
    <div class="rounded-xl border border-default bg-elevated px-5 py-4 space-y-3.5 mb-6">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
        <UButton
          :icon="playing ? 'i-lucide-pause' : 'i-lucide-play'"
          variant="soft"
          :disabled="!difficulty?.chart"
          @click="toggle"
        >
          {{ playing ? 'Pause' : 'Play' }}
        </UButton>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Speed
          <USelect v-model="speed" :items="speedItems" class="w-20" />
        </label>
        <UCheckbox v-model="playMode" label="Play mode (tap to judge)" />
        <label v-if="playMode" class="flex items-center gap-2.5 text-xs text-muted">
          Judge
          <USelect v-model="judgeMode" :items="judgeModeItems" class="w-28" />
        </label>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Offset
          <USlider v-model="offsetMs" :min="-200" :max="200" :step="5" class="w-24" />
          <span class="font-mono text-default">{{ offsetMs }} ms</span>
        </label>
        <label class="flex items-center gap-2.5 text-xs text-muted">
          Note scale
          <USlider v-model="scale" :min="0.7" :max="1" :step="0.01" class="w-24" />
          <span class="font-mono text-default">{{ scale.toFixed(2) }}×</span>
        </label>
        <UCheckbox v-model="judgement" label="Judgement text" />
        <UCheckbox v-model="timing" label="Fast / slow" />
        <span class="ml-auto font-mono text-primary text-xs">{{ fmt(time) }} / {{ fmt(duration) }}</span>
      </div>
      <input
        type="range"
        min="0"
        :max="duration || 1"
        step="0.01"
        :value="time"
        aria-label="Chart time"
        class="w-full accent-primary cursor-pointer"
        @pointerdown="dragging = true"
        @input="onTimeline"
        @change="dragging = false"
        @pointerup="dragging = false"
      >
      <div class="flex justify-between text-xs text-muted font-mono">
        <span>00:00</span>
        <span>{{ fmt(duration) }}</span>
      </div>
    </div>

    <div class="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
      <div class="rounded-xl border border-default bg-elevated overflow-hidden flex flex-col gap-3">
        <div class="flex justify-between items-center gap-3 px-6 py-5">
          <h3 class="text-[17px] font-medium text-default">
            {{ level?.title || 'No level loaded' }}
          </h3>
          <div class="flex gap-5 font-mono text-[11px] text-muted">
            <span v-if="level">{{ level.artist }}</span>
            <span v-if="difficulty">{{ difficulty.name }} · LV {{ difficulty.difficulty }}</span>
          </div>
        </div>
        <div
          class="relative w-full aspect-video bg-[#16171d] border-y border-default overflow-hidden"
          style="touch-action: none"
          @dragover.prevent
          @drop="onDrop"
          @pointerdown="onDown"
          @pointermove="onMove"
          @pointerup="onUp"
          @pointercancel="onUp"
        >
          <div ref="hostEl" class="absolute inset-0" />
          <div
            v-if="!level"
            class="absolute inset-0 grid place-items-center pointer-events-none"
          >
            <div class="text-center text-xs text-muted leading-relaxed">
              <p class="text-[15px] text-default">
                Drop a <code class="text-primary/90 bg-muted px-1.5 py-1 rounded font-mono">.cytoidlevel</code> here
              </p>
              <p>or pick one below.</p>
            </div>
          </div>
        </div>
        <div class="flex justify-between items-center gap-3 px-6 pb-5 font-mono text-[10px] text-muted">
          <span>{{ difficulty?.chart ? `${difficulty.chart.note_list.length} NOTES` : '—' }}</span>
          <span v-if="stats">MAX COMBO {{ stats.maxCombo }} · P{{ stats.perfect }} G{{ stats.great }} Go{{ stats.good }} B{{ stats.bad }} M{{ stats.miss }}<template v-if="timing"> · FAST {{ stats.fast }} SLOW {{ stats.slow }}</template></span>
          <span v-else>{{ playing ? 'PLAYING' : time > 0 ? 'PAUSED' : 'IDLE' }}</span>
          <span>{{ playMode ? 'PLAY MODE' : 'AUTOPLAY' }} · LIVE VECTOR</span>
        </div>
      </div>

      <aside class="rounded-xl border border-default bg-elevated p-6">
        <h3 class="text-[17px] font-medium text-default mb-3.5">
          Level
        </h3>
        <UButton
          block
          variant="soft"
          color="primary"
          :loading="loading && isDemo"
          :disabled="loading"
          class="mb-2"
          @click="loadDemo"
        >
          Load demo level
        </UButton>
        <p class="text-[10px] text-muted leading-relaxed mb-4">
          夢色パレード (w/ 桃箱 & miko) — Yunomi · charter Teages ·
          <a href="https://creativecommons.org/licenses/by-nc-sa/3.0/" target="_blank" rel="license noopener" class="underline">CC BY-NC-SA 3.0</a>
        </p>
        <UFileUpload
          v-model="uploadedFile"
          accept=".cytoidlevel,.zip"
          icon="i-lucide-file-up"
          label="Open .cytoidlevel"
          description="Click to browse, or drop it here"
          :disabled="loading && !isDemo"
          class="w-full"
        />
        <div v-if="level" class="flex flex-col gap-2 mt-4">
          <UButton
            v-for="(d, i) in level.difficulties"
            :key="i"
            block
            :color="i === current ? 'primary' : 'neutral'"
            variant="outline"
            :disabled="d.chart == null"
            class="justify-start gap-2"
            @click="current = i"
          >
            <span class="font-mono text-[10px] tracking-wide uppercase">{{ d.type }}</span>
            <span class="flex-1 text-left">{{ d.name }} · LV {{ d.difficulty }}</span>
            <span v-if="d.chart == null" class="text-muted">C1</span>
          </UButton>
        </div>
        <p v-if="error" class="text-xs text-error mt-3">
          {{ error }}
        </p>
      </aside>
    </div>
  </div>
</template>
