<script setup lang="ts">
import LabGallery from '~/components/lab/LabGallery.vue'

definePageMeta({ layout: 'docs' })

useSeoMeta({
  title: 'Notes',
  description: 'A full set of flat-style note designs for Cytoid — every kind, both directions, rendered live from the vector design.',
})
</script>

<template>
  <div>
    <UPageHeader
      title="Notes"
      description="A full set of flat-style note designs for Cytoid — every kind, both directions, rendered live from the vector design."
    />
    <UPageBody>
      <LabGallery />
    </UPageBody>
  </div>
</template>
