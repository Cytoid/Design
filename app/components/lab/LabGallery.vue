<script setup lang="ts">
import { NOTE_KINDS } from '@cytoid/notes'
import LabGalleryCard from './GalleryCard.vue'
import LabReviewControls from './ReviewControls.vue'
</script>

<template>
  <div>
    <LabReviewControls />
    <div class="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4.5">
      <LabGalleryCard v-for="(kind, i) in NOTE_KINDS" :key="kind" :kind="kind" :index="i" />
    </div>
  </div>
</template>
