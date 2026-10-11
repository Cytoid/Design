<script setup lang="ts">
import type { NoteKind } from '@cytoid/notes'
import { KIND_LABEL, NOTE_KINDS } from '@cytoid/notes'
import LabInspector from '~/components/lab/LabInspector.vue'

definePageMeta({ layout: 'docs' })

const route = useRoute()
const kind = route.params.kind as NoteKind

if (!(NOTE_KINDS as readonly string[]).includes(kind))
  throw createError({ statusCode: 404, statusMessage: 'Note kind not found', fatal: true })

const DESCRIPTIONS: Record<NoteKind, string> = {
  'click': 'Tap note — approach ring, hit burst and the full judgement colour set.',
  'hold': 'Sustained tap — head, shrinking body and the release burst at the scanline.',
  'long-hold': 'Full-height sustained pillar spanning multiple pages.',
  'drag-head': 'Drag chain head — approach, hit, then follow-through along the chain.',
  'drag-child': 'Drag chain child node with its connection line.',
  'flick': 'Flick note — directional swipe with the enter dash.',
  'click-drag-head': 'Tap that starts a drag chain.',
  'click-drag-child': 'Tap node inside a click-drag chain.',
  'drop-click': 'Drop tap — falls onto the scanline from above.',
  'drop-drag': 'Drop drag chain variant.',
}

useSeoMeta({
  title: KIND_LABEL[kind],
  description: DESCRIPTIONS[kind],
})
</script>

<template>
  <div>
    <UPageHeader
      :title="KIND_LABEL[kind]"
      :description="DESCRIPTIONS[kind]"
    />
    <UPageBody>
      <LabInspector :kind="kind" />
    </UPageBody>
  </div>
</template>
