import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use node environment — canvas pkg provides a headless Canvas2D implementation.
    // jsdom would require additional setup; node + canvas is simpler and sufficient.
    environment: 'node',
    setupFiles: ['./test/vitest-setup.ts'],
    include: ['test/**/*.vitest.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
})
