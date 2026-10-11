<template>
  <UContainer>
    <UPage>
      <template #left>
        <UPageAside>
          <AppSideNav />
        </UPageAside>
      </template>

      <slot />
    </UPage>
  </UContainer>
</template>
