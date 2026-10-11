<script setup lang="ts">
import LabPlayerView from '../components/lab/PlayerView.vue'

definePageMeta({ layout: 'docs' })

useSeoMeta({
  title: 'Player',
  description: 'Cytoid charts rendered live by the @cytoid/player core — vector notes, judging and audio. Drop a .cytoidlevel on the stage or try the demo level.',
})
</script>

<template>
  <div>
    <UPageHeader
      title="Player"
      description="Cytoid charts rendered live by the @cytoid/player core — vector notes, judging and audio. Drop a .cytoidlevel on the stage or try the demo level."
    />
    <UPageBody>
      <ClientOnly>
        <LabPlayerView />
        <template #fallback>
          <div class="min-h-[480px]" />
        </template>
      </ClientOnly>
    </UPageBody>
  </div>
</template>
