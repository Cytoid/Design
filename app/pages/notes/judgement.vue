<script setup lang="ts">
import LabJudgement from '~/components/lab/LabJudgement.vue'

definePageMeta({ layout: 'docs' })

useSeoMeta({
  title: 'Judgement',
  description: 'Judgement text and the FAST / SLOW timing label: two independent settings, where each one sits and how they stack.',
})
</script>

<template>
  <div>
    <UPageHeader
      title="Judgement"
      description="Judgement text and the FAST / SLOW timing label: two independent settings, where each one sits and how they stack."
    />
    <UPageBody>
      <LabJudgement />
    </UPageBody>
  </div>
</template>
