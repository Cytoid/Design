<script setup lang="ts">
import type { Direction, Family, PaletteOptions } from '@cytoid/notes'
import { BASE_SHADE, FAMILIES, FAMILY_LABEL, hexToOklch, KIND_LABEL, NOTE_KINDS, SHADES } from '@cytoid/notes'
import { tokens } from '@cytoid/skin-flat'
import { computed, ref } from 'vue'
import { palette, paletteOptions, validatePalette } from '../../composables/usePalette'
import LabNoteCanvas from './NoteCanvas.vue'

const toast = useToast()

const directions: Direction[] = ['up', 'down']
const json = ref('')
const exported = computed(() => `${JSON.stringify(paletteOptions.value, null, 2)}\n`)
const presets: {
  name: string
  value: PaletteOptions
  colors: string[]
}[] = [
  {
    name: 'Default',
    value: {},
    colors: ['#35a7ff', '#ff5964', '#39e59e'],
  },
  {
    name: 'Cytoid classic',
    value: {
      families: {
        'click': { up: '#35A7FF', down: '#FF5964' },
        'click-drag': { up: '#35A7FF', down: '#FF5964' },
        'drop-click': { up: '#35A7FF', down: '#FF5964' },
        'hold': { up: '#35A7FF', down: '#FF5964' },
        'long-hold': { up: '#F2C85A', down: '#F2C85A' },
        'flick': { up: '#35A7FF', down: '#FF5964' },
        'drag': { up: '#39E59E', down: '#39E59E' },
        'drop-drag': { up: '#39E59E', down: '#39E59E' },
      },
    },
    colors: ['#35A7FF', '#FF5964', '#F2C85A'],
  },
  {
    name: 'Aurora',
    value: {
      families: {
        'click': { up: '#00FFC5', down: '#00C2FF' },
        'click-drag': { up: '#00FFC5', down: '#00C2FF' },
        'drop-click': { up: '#00FFC5', down: '#00C2FF' },
        'hold': { up: '#CC52B8', down: '#CC5254' },
        'long-hold': { up: '#FFDD5B', down: '#FFDD5B' },
        'flick': { up: '#4CBF6D', down: '#4C8ABF' },
        'drag': { up: '#573DCC', down: '#B43DCC' },
        'drop-drag': { up: '#573DCC', down: '#B43DCC' },
      },
    },
    colors: ['#00ffc5', '#b43dcc', '#ffdd5b'],
  },
  {
    name: 'Aurora soft',
    value: {
      families: {
        'click': { up: '#17E5C3', down: '#17CDE5' },
        'click-drag': { up: '#17E5C3', down: '#17CDE5' },
        'drop-click': { up: '#17E5C3', down: '#17CDE5' },
        'hold': { up: '#B347A8', down: '#B34757' },
        'long-hold': { up: '#FFDD5B', down: '#FFDD5B' },
        'flick': { up: '#4CBF6D', down: '#4C8ABF' },
        'drag': { up: '#573DCC', down: '#B43DCC' },
        'drop-drag': { up: '#573DCC', down: '#B43DCC' },
      },
    },
    colors: ['#17e5c3', '#b347a8', '#ffdd5b'],
  },
  {
    name: 'Monochrome',
    value: { saturation: 0 },
    colors: ['#a5a5a5', '#bdbdbd', '#d0d0d0'],
  },
  {
    name: 'Orchid',
    value: { hueShift: 45, saturation: 0.8 },
    colors: ['#b390e5', '#e8ab70', '#79c4b1'],
  },
  {
    name: 'Lagoon',
    value: { hueShift: -35, saturation: 0.75, ring: '#E3F6F0' },
    colors: ['#68b8be', '#dc90b8', '#b0c875'],
  },
]
function preset(value: PaletteOptions) {
  paletteOptions.value = structuredClone(value)
  toast.add({ title: 'Palette Applied', description: 'The selected palette has been applied to all live previews.', color: 'success' })
}
function inputFor(family: Family, dir: Direction) {
  return paletteOptions.value.families?.[family]?.[dir] ?? tokens.hue[family][dir]
}
function hue(family: Family, dir: Direction) {
  const value = inputFor(family, dir)
  return typeof value === 'number' ? ((value % 360) + 360) % 360 : Math.round(hexToOklch(value).h)
}
function setColor(family: Family, dir: Direction, value: number | string | undefined) {
  const families = paletteOptions.value.families ??= {}
  const pair = families[family] ??= {}
  if (value === undefined)
    delete pair[dir]
  else
    pair[dir] = value
}
function hexChange(family: Family, dir: Direction, event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.value.trim()
  if (!value) {
    setColor(family, dir, undefined)
    return
  }
  if (!/^#[\da-f]{6}$/i.test(value)) {
    toast.add({ title: 'Invalid Colour', description: 'Use a six-digit colour, e.g. #35A7FF, or clear the field to restore the default.', color: 'error' })
    input.value = typeof inputFor(family, dir) === 'string' ? String(inputFor(family, dir)) : ''
    return
  }
  setColor(family, dir, value)
  toast.add({ title: 'Raw Hex Applied', description: 'Raw hex applied. Global hue shift affects numeric hues only.', color: 'success' })
}
function ringChange(event: Event) {
  const input = event.target as HTMLInputElement
  if (/^#[\da-f]{6}$/i.test(input.value)) {
    paletteOptions.value.ring = input.value
  }
  else {
    input.value = paletteOptions.value.ring || palette.value.note('click', 'up').ring
    toast.add({ title: 'Invalid Ring Colour', description: 'Ring colour must be #rrggbb.', color: 'error' })
  }
}
function importJSON(text: string) {
  try {
    paletteOptions.value = validatePalette(JSON.parse(text))
    toast.add({ title: 'Palette Imported', description: 'Palette imported successfully.', color: 'success' })
  }
  catch (cause) {
    toast.add({ title: 'Invalid JSON', description: cause instanceof Error ? cause.message : 'Invalid JSON.', color: 'error' })
  }
}
async function importFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  try {
    json.value = await file.text()
    importJSON(json.value)
  }
  catch {
    toast.add({ title: 'File Read Error', description: 'Unable to read this file.', color: 'error' })
  }
  input.value = ''
}
async function copy() {
  try {
    await navigator.clipboard.writeText(exported.value)
    toast.add({ title: 'Copied to Clipboard', description: 'Palette JSON copied.', color: 'success' })
  }
  catch {
    json.value = exported.value
    toast.add({ title: 'Clipboard Unavailable', description: 'Copy the JSON from the editor below.', color: 'error' })
  }
}
function download() {
  const url = URL.createObjectURL(new Blob([exported.value], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'cytoid-palette.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <div class="space-y-4.5">
    <div class="grid lg:grid-cols-[minmax(0,1fr)_400px] gap-6 items-start">
      <div class="space-y-4.5">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-[15px] font-medium text-default">
                Start with a palette
              </h3>
              <UButton variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" @click="preset({})">
                Reset
              </UButton>
            </div>
          </template>
          <div class="flex flex-wrap gap-2.5">
            <UButton
              v-for="p in presets"
              :key="p.name"
              variant="soft"
              color="neutral"
              class="flex-1 min-w-24 flex-col items-center gap-2 py-3.5 text-xs"
              @click="preset(p.value)"
            >
              <span class="flex gap-1">
                <i v-for="c in p.colors" :key="c" class="size-4 rounded-full" :style="{ background: c }" />
              </span>
              {{ p.name }}
            </UButton>
          </div>
        </UCard>

        <UCard title="Global adjustments">
          <div class="space-y-5">
            <label class="block">
              <span class="flex justify-between text-xs text-muted mb-3">Hue shift <span class="font-mono text-default">{{ paletteOptions.hueShift || 0 }}°</span></span>
              <input v-model.number="paletteOptions.hueShift" class="hue-range w-full" type="range" min="-180" max="180" step="1">
            </label>
            <label class="block">
              <span class="flex justify-between text-xs text-muted mb-3">Saturation <span class="font-mono text-default">{{ (paletteOptions.saturation ?? 1).toFixed(2) }}×</span></span>
              <input v-model.number="paletteOptions.saturation" class="w-full accent-primary cursor-pointer" type="range" min="0" max="2" step="0.01">
            </label>
            <div class="flex items-center gap-4 text-xs text-muted">
              Ring colour
              <input type="color" :value="paletteOptions.ring || palette.note('click', 'up').ring" aria-label="Ring colour picker" class="size-8 p-0 bg-transparent border-0 cursor-pointer" @input="ringChange">
              <input class="w-22 font-mono text-xs bg-default border border-default rounded-md px-2 py-1.5 text-default" :value="paletteOptions.ring || palette.note('click', 'up').ring" aria-label="Ring hex colour" maxlength="7" @change="ringChange">
            </div>
            <p class="text-xs text-muted leading-relaxed">
              OKLCH hues preserve the design's lightness balance. Raw hex preserves your custom colour's lightness and chroma; hue shift leaves hex overrides as entered. The ring colour re-anchors the ring band's 50 step; the note colour band is untouched.
            </p>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-[15px] font-medium text-default">
                Family colours
              </h3>
              <span class="text-[9px] tracking-[1.8px] text-muted">UP / DOWN</span>
            </div>
          </template>
          <div v-for="family in FAMILIES" :key="family" class="border-t border-default py-4.5 last:pb-0">
            <h4 class="text-xs font-medium text-default mb-3.5">
              {{ FAMILY_LABEL[family] }}
            </h4>
            <template v-for="dir in directions" :key="dir">
              <div class="flex items-center gap-3 mt-3">
                <span class="text-muted w-2.5">{{ dir === 'up' ? '↑' : '↓' }}</span>
                <span class="size-2.5 rounded-full shrink-0" :style="{ background: palette.family(family, dir)[400] }" />
                <input
                  class="hue-range flex-1 min-w-[70px]"
                  type="range"
                  min="0"
                  max="360"
                  step="1"
                  :value="hue(family, dir)"
                  :aria-label="`${family} ${dir} hue`"
                  @input="setColor(family, dir, Number(($event.target as HTMLInputElement).value))"
                >
                <span class="font-mono text-[11px] text-muted w-9 text-right">{{ hue(family, dir) }}°</span>
                <input
                  class="w-[88px] font-mono text-[11px] bg-default border border-default rounded-md px-2 py-1.5 text-default"
                  :value="typeof inputFor(family, dir) === 'string' ? inputFor(family, dir) : ''"
                  placeholder="#rrggbb"
                  :aria-label="`${family} ${dir} raw hex override`"
                  maxlength="7"
                  @change="hexChange(family, dir, $event)"
                >
                <UButton variant="ghost" color="neutral" size="xs" :aria-label="`Reset ${family} ${dir}`" icon="i-lucide-rotate-ccw" @click="setColor(family, dir, undefined)" />
              </div>
              <div class="grid grid-cols-11 gap-0.5 mt-1.5 ml-5.5" :aria-label="`${family} ${dir} shades`">
                <i
                  v-for="s in SHADES"
                  :key="s"
                  :class="{ 'outline outline-white -outline-offset-1': s === BASE_SHADE }"
                  class="h-[18px] rounded-sm flex items-end justify-center"
                  :style="{ background: palette.family(family, dir)[s] }"
                  :title="`${s} ${palette.family(family, dir)[s]}`"
                ><span class="text-[8px] not-italic text-white mix-blend-difference opacity-70 font-mono">{{ s }}</span></i>
              </div>
            </template>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-[15px] font-medium text-default">
                Palette JSON
              </h3>
              <div class="flex items-center gap-2">
                <UButton variant="ghost" color="neutral" @click="copy">
                  Copy
                </UButton>
                <UButton icon="i-lucide-download" @click="download">
                  Download
                </UButton>
              </div>
            </div>
          </template>
          <UTextarea
            v-model="json"
            :rows="6"
            class="w-full my-3.5"
            aria-label="Palette JSON to import"
            placeholder="Paste PaletteOptions JSON, e.g. {&quot;hueShift&quot;: 20}"
          />
          <div class="flex items-center gap-2">
            <UButton variant="soft" @click="importJSON(json)">
              Import JSON
            </UButton>
            <label class="border border-default rounded-md px-3 py-2 text-xs cursor-pointer text-default">
              Import file
              <input type="file" accept="application/json,.json" class="hidden" @change="importFile">
            </label>
          </div>
        </UCard>
      </div>

      <aside class="rounded-xl border border-default bg-elevated overflow-hidden lg:sticky lg:top-6">
        <div class="px-6 pt-6 pb-3">
          <div class="grid grid-cols-2 ml-[120px] text-center text-[9px] tracking-wide text-muted">
            <span>UP ↑</span>
            <span>DOWN ↓</span>
          </div>
        </div>
        <div v-for="kind in NOTE_KINDS" :key="kind" class="grid grid-cols-[135px_1fr_1fr] h-[85px] border-t border-default bg-[#16171d] items-center">
          <span class="pl-6 text-[11px] text-muted">{{ KIND_LABEL[kind] }}</span>
          <div v-for="dir in directions" :key="dir" class="relative h-[85px] min-w-0">
            <LabNoteCanvas :kind="kind" :direction="dir" :state="{ phase: 'enter', p: 1 }" :scale="0.42" />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* gradient-track hue sliders: the gradient + thumb styling needs real
   pseudo-elements, which Tailwind utilities can't express on their own */
.hue-range {
  appearance: none;
  background: linear-gradient(to right, #ed7c96, #d59357, #abc452, #59caa1, #64bcd9, #919ce9, #d58ada, #ed7c96);
  border-radius: 10px;
  height: 5px;
  cursor: pointer;
}
.hue-range::-webkit-slider-thumb {
  appearance: none;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: white;
  border: 2px solid #1c1e27;
  box-shadow: 0 0 0 1px #e7e9ef;
}
.hue-range::-moz-range-thumb {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: white;
  border: 2px solid #1c1e27;
}
</style>
