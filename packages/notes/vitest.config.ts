import { defineConfig } from 'vitest/config'

// Package-local config; the workspace root `vitest.config.ts` matches this
// directory via the `packages/*` glob (project name: `@cytoid/notes`).
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
