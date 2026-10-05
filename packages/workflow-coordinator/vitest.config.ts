import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default {
  test: { include: ['test/**/*.test.ts'], exclude: ['**/dist/**'] },
  resolve: { alias: { '@brambodev/contracts': resolve(packageRoot, '../contracts/src/index.ts') } },
  ssr: { resolve: { conditions: ['brambo-source'] } },
}
