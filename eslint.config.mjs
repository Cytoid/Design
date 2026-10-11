// @ts-check
import antfu from '@antfu/eslint-config'
import betterTailwindcss from 'eslint-plugin-better-tailwindcss'
import { getDefaultSelectors } from 'eslint-plugin-better-tailwindcss/api/defaults'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  // @antfu/eslint-config owns formatting & general linting, appended after
  // the Nuxt-generated config so its rules take precedence on conflicts.
  antfu(),
  betterTailwindcss.configs['correctness-error'],
  {
    // docs content contains markdown examples with demo headings; the rules
    // must be scoped to md files so they override antfu/markdown/rules
    files: ['**/*.md'],
    rules: {
      'markdown/no-multiple-h1': 'off',
      'markdown/heading-increment': 'off',
    },
  },
  {
    settings: {
      'better-tailwindcss': {
        entryPoint: 'app/assets/css/main.css',
        selectors: [
          ...getDefaultSelectors(),
          { kind: 'attribute', name: '^v-bind:ui$', match: [{ type: 'objectValues' }] },
        ],
      },
    },
    rules: {
      'better-tailwindcss/no-unknown-classes': ['error', { ignore: ['^stars$', '^star-layer$', '^star$'] }],
    },
  },
)
