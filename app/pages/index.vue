<script setup lang="ts">
import LabHeroStage from '~/components/lab/HeroStage.vue'

useSeoMeta({
  titleTemplate: '',
  title: 'Design.Cytoid',
  ogTitle: 'Design.Cytoid',
  description: 'Flat-style Cytoid note designs and a browser chart player — every preview renders live from the vector design.',
  ogDescription: 'Flat-style Cytoid note designs and a browser chart player — every preview renders live from the vector design.',
})
</script>

<template>
  <div>
    <section class="grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100vh-var(--ui-header-height))] max-w-[1600px] mx-auto px-6 sm:px-12 py-12">
      <div>
        <h1 class="text-5xl sm:text-6xl font-bold tracking-tight text-default text-pretty">
          The next design of
          <span class="block text-primary">Cytoid</span>
        </h1>

        <div class="mt-8 flex flex-wrap gap-3">
          <UButton to="/notes" size="xl">
            Explore notes
          </UButton>
          <UButton
            to="/player"
            size="xl"
            color="neutral"
            variant="outline"
            icon="i-lucide-play"
          >
            Open the player
          </UButton>
        </div>
      </div>

      <ClientOnly>
        <LabHeroStage />
        <template #fallback>
          <div class="rounded-2xl border border-default bg-[#16171d] min-h-[420px]" />
        </template>
      </ClientOnly>
    </section>
  </div>
</template>
