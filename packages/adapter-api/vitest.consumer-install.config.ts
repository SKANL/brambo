import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [...defaultExclude, '**/dist/**'],
    include: ['test/consumer-install.proof.ts'],
    hookTimeout: 300_000,
    testTimeout: 300_000,
  },
})
