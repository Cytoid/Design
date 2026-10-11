<script setup lang="ts">
import type { SidebarLink } from '~/utils/navigation'
import { sidebarSections } from '~/utils/navigation'

const route = useRoute()

function linkClass(link: SidebarLink) {
  return route.path === link.path
    ? 'text-primary bg-primary/10 font-medium'
    : 'text-muted hover:text-default hover:bg-elevated'
}
</script>

<template>
  <nav class="space-y-6 text-sm" aria-label="Site">
    <div v-for="section in sidebarSections" :key="section.label">
      <p class="px-2.5 mb-2 text-[9px] font-semibold tracking-[1.8px] text-dimmed uppercase">
        {{ section.label }}
      </p>
      <ul class="space-y-0.5">
        <li v-for="link in section.links" :key="link.path">
          <NuxtLink
            :to="link.path"
            class="block rounded-md px-2.5 py-1.5 transition-colors"
            :class="linkClass(link)"
          >
            {{ link.title }}
          </NuxtLink>
        </li>
        <li v-for="family in section.families ?? []" :key="family.label" class="mt-3.5">
          <p class="px-2.5 mb-1 text-[10px] tracking-wide text-dimmed">
            {{ family.label }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="link in family.links" :key="link.path">
              <NuxtLink
                :to="link.path"
                class="block rounded-md pl-5 pr-2.5 py-1.5 transition-colors"
                :class="linkClass(link)"
              >
                {{ link.title }}
              </NuxtLink>
            </li>
          </ul>
        </li>
      </ul>
    </div>
  </nav>
</template>
