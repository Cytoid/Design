// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  // workspace packages are consumed from TypeScript source
  // (vite alias for runtime, tsconfig paths for types)
  alias: {
    '@cytoid/skin-flat/skin.json': fileURLToPath(new URL('./packages/skin-flat/src/flat.skin.json', import.meta.url)),
    '@cytoid/skin-flat': fileURLToPath(new URL('./packages/skin-flat/src/index.ts', import.meta.url)),
    '@cytoid/notes': fileURLToPath(new URL('./packages/notes/src/index.ts', import.meta.url)),
    '@cytoid/player': fileURLToPath(new URL('./packages/player/src/index.ts', import.meta.url)),
  },

  typescript: {
    tsConfig: {
      compilerOptions: {
        paths: {
          '@cytoid/notes': ['../packages/notes/src/index.ts'],
          '@cytoid/skin-flat': ['../packages/skin-flat/src/index.ts'],
          '@cytoid/skin-flat/skin.json': ['../packages/skin-flat/src/flat.skin.json'],
          '@cytoid/design-tools': ['../packages/design-tools/src/index.ts'],
          '@cytoid/design-tools/authoring': ['../packages/design-tools/src/authoring.ts'],
          '@cytoid/player': ['../packages/player/src/index.ts'],
        },
      },
    },
  },

  // dark theme only; the fresh storage key drops any stale light preference
  // from before the theme toggle was removed
  colorMode: {
    preference: 'dark',
    fallback: 'dark',
    storageKey: 'cytoid-design-color-mode',
  },

  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    'nuxt-og-image',
  ],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  experimental: {
    asyncContext: true,
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      // formatting is owned by @antfu/eslint-config, which also provides
      // the ts/vue/import plugins when standalone mode is off
      stylistic: false,
      standalone: false,
    },
  },

  ogImage: {
    zeroRuntime: true,
  },

  prerender: {
    routes: [
      '/',
      // the inspector links live inside collapsed sidebar accordions, so the
      // link crawler never sees them — list the pages explicitly
      '/notes',
      '/notes/inspector/click',
      '/notes/inspector/hold',
      '/notes/inspector/long-hold',
      '/notes/inspector/drag-head',
      '/notes/inspector/drag-child',
      '/notes/inspector/flick',
      '/notes/inspector/click-drag-head',
      '/notes/inspector/click-drag-child',
      '/notes/inspector/drop-click',
      '/notes/inspector/drop-drag',
      '/notes/palette',
    ],
    crawlLinks: true,
  },
})
