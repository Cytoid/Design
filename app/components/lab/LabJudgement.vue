<script setup lang="ts">
import type { ClearGrade, Timing } from '@cytoid/notes'
import type { CanvasFrame } from './StageCanvas.vue'
import { createContext, drawScene, renderNote, TIMED_GRADES, tokens } from '@cytoid/notes'
import { palette } from '../../composables/usePalette'
import { review } from '../../composables/useReview'
import NoteCanvas from './NoteCanvas.vue'
import StageCanvas from './StageCanvas.vue'

/** The two independent settings, every combination. */
const matrix = [
  { judgement: true, timing: true, title: 'Judgement text + fast / slow', note: 'FAST / SLOW drops to a smaller second line under the judgement underline.' },
  { judgement: false, timing: true, title: 'Fast / slow only', note: 'With the judgement text off, the label takes the centre — where Cytoid’s EARLY / LATE always sat.' },
  { judgement: true, timing: false, title: 'Judgement text only', note: 'Today’s default layout, unchanged.' },
  { judgement: false, timing: false, title: 'Neither', note: 'Just the effect.' },
]

/** Demo loop: GREAT → GOOD → BAD, alternating FAST / SLOW. */
const LOOP: { grade: ClearGrade, timing: Timing }[] = [
  { grade: 'great', timing: 'fast' },
  { grade: 'good', timing: 'slow' },
  { grade: 'bad', timing: 'fast' },
  { grade: 'great', timing: 'slow' },
  { grade: 'good', timing: 'fast' },
  { grade: 'bad', timing: 'slow' },
]
const BEAT = 0.95
let elapsed = 0

function painter(opts: { judgement: boolean, timing: boolean }) {
  return ({ ctx, width, height, dt }: CanvasFrame) => {
    if (review.playing)
      elapsed += dt / matrix.length
    const i = Math.floor(elapsed / BEAT) % LOOP.length
    const hit = LOOP[i]!
    const t = elapsed % BEAT
    const dc = createContext('click', { palette: palette.value, direction: review.direction, scale: 1 })
    ctx.translate(width / 2, height / 2)
    const node = t < tokens.time.clear[hit.grade]
      ? renderNote('click', { phase: 'clear', grade: hit.grade, t, timing: hit.timing }, dc, opts)
      : renderNote('click', { phase: 'enter', p: 0.92 + (t - tokens.time.clear[hit.grade]) / (BEAT - tokens.time.clear[hit.grade]) * 0.08 }, dc, { judgement: false })
    drawScene(ctx, node)
  }
}

const stills = TIMED_GRADES.flatMap(grade => (['fast', 'slow'] as const).map(timing => ({ grade, timing })))
</script>

<template>
  <div class="space-y-10">
    <section>
      <h2 class="text-lg font-medium text-default mb-2">
        Two settings, one slot each
      </h2>
      <p class="text-sm text-muted leading-relaxed mb-5 max-w-3xl">
        Cytoid printed EARLY / LATE in the middle of the clear effect. The new judgement text lives there now, so FAST / SLOW
        gets its own layer and its own toggle. Each setting is fixed for the whole session, so the label never jumps
        between slots mid-play.
      </p>
      <div class="grid sm:grid-cols-2 gap-4">
        <article v-for="m in matrix" :key="m.title" class="border border-default rounded-xl overflow-hidden bg-elevated">
          <header class="flex items-center gap-2 px-4.5 py-3.5">
            <h3 class="text-sm flex-1 text-default">
              {{ m.title }}
            </h3>
            <UBadge :color="m.judgement ? 'primary' : 'neutral'" variant="subtle" size="sm">
              Text {{ m.judgement ? 'on' : 'off' }}
            </UBadge>
            <UBadge :color="m.timing ? 'primary' : 'neutral'" variant="subtle" size="sm">
              F/S {{ m.timing ? 'on' : 'off' }}
            </UBadge>
          </header>
          <div class="relative h-[220px] bg-[#16171d] border-y border-default">
            <StageCanvas :paint="painter(m)" :label="m.title" />
          </div>
          <p class="px-4.5 py-3 text-xs text-muted leading-relaxed">
            {{ m.note }}
          </p>
        </article>
      </div>
    </section>

    <section>
      <h2 class="text-lg font-medium text-default mb-2">
        Grades × timing
      </h2>
      <p class="text-sm text-muted leading-relaxed mb-5 max-w-3xl">
        Only GREAT, GOOD and BAD carry a timing (Cytoid rule). PERFECT is inside the window and MISS has no press, so
        neither shows one. Auto-cleared drag children are always PERFECT, so they never do either.
      </p>
      <div class="grid grid-cols-3 lg:grid-cols-6 gap-2">
        <div v-for="s in stills" :key="`${s.grade}-${s.timing}`" class="relative h-[150px] rounded-lg border border-default bg-[#16171d] overflow-hidden">
          <NoteCanvas kind="click" :direction="review.direction" :state="{ phase: 'clear', grade: s.grade, t: 0.45 * tokens.time.clear[s.grade], timing: s.timing }" :scale="0.8" judgement />
          <span class="absolute bottom-1.5 left-2 text-[10px] font-mono text-gray-400">{{ s.grade }} · {{ s.timing }}</span>
        </div>
      </div>
    </section>

    <section class="max-w-3xl">
      <h2 class="text-lg font-medium text-default mb-3">
        Design rules
      </h2>
      <ul class="text-sm text-muted leading-relaxed list-disc pl-5 space-y-2">
        <li><b class="text-default">Independent toggles.</b> “Judgement text” and “Fast / slow” are separate settings. The label sits under the judgement text when both are on, and takes the centre when it is shown alone.</li>
        <li><b class="text-default">Secondary size.</b> Cap height is 0.6 × the judgement text, with a slightly heavier stroke so it still reads at that size. It stays inside the clear effect.</li>
        <li><b class="text-default">Fixed direction colours (experiment).</b> FAST is red and SLOW is green, whatever the grade — at full strength, like the judgement text, so the direction reads at a glance. The base design ties the colour to the grade instead.</li>
        <li><b class="text-default">Direction is shape and motion.</b> The horizontal axis is time. FAST has a ‹ chevron on its left and slides in leftward (ahead of the beat). SLOW has a › on its right and slides in rightward (behind it). You can tell them apart in peripheral vision without reading the word.</li>
        <li><b class="text-default">Same timing as the judgement.</b> The label appears just after the judgement letters pop in, rises with the text and fades out over the same window. It never outlives the effect.</li>
        <li><b class="text-default">Hold notes</b> show the timing of the head press on the clear at the hold end. The play stats count FAST / SLOW, like the Early / Late counts on Cytoid’s result screen.</li>
      </ul>
    </section>
  </div>
</template>
