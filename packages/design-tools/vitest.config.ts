import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' }, resolve: { alias: [
  { find: '@cytoid/notes', replacement: fileURLToPath(new URL('../notes/src/index.ts', import.meta.url)) },
  { find: '@cytoid/design-tools/authoring', replacement: fileURLToPath(new URL('../design-tools/src/authoring.ts', import.meta.url)) },
  { find: '@cytoid/design-tools', replacement: fileURLToPath(new URL('../design-tools/src/index.ts', import.meta.url)) },
] } })
