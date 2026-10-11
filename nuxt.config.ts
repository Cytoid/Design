// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/image',
    '@nuxt/ui',
    '@nuxt/content',
    'nuxt-og-image',
  ],

  devtools: {
    enabled: true,
  },

  css: ['~/assets/css/main.css'],

  content: {
    build: {
      markdown: {
        toc: {
          searchDepth: 1,
        },
      },
    },
    experimental: {
      sqliteConnector: 'native',
    },
  },

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
    ],
    crawlLinks: true,
  },
})
