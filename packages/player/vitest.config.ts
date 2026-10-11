import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: [
      // Resolve the library to source so tests never need a prior build
      // (the published entry points at dist/).
      { find: /^@cytoid\/notes$/, replacement: fileURLToPath(new URL('../notes/src/index.ts', import.meta.url)) },
    ],
  },
})
