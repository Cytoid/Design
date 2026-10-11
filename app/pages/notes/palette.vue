<script setup lang="ts">
import LabPalette from '~/components/lab/LabPalette.vue'

definePageMeta({ layout: 'docs' })

useSeoMeta({
  title: 'Palette',
  description: 'Recolour every note family with OKLCH hues or raw hex, export the palette JSON and see all kinds update live.',
})
</script>

<template>
  <div>
    <UPageHeader
      title="Palette"
      description="Recolour every note family with OKLCH hues or raw hex, export the palette JSON and see all kinds update live."
    />
    <UPageBody>
      <LabPalette />
    </UPageBody>
  </div>
</template>
