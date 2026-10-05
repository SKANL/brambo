import { defaultExclude, defineConfig } from 'vitest/config'

export default defineConfig({
  test: { exclude: [...defaultExclude, '**/dist/**'], testTimeout: 30_000 },
  ssr: { resolve: { conditions: ['brambo-source'] } },
})
