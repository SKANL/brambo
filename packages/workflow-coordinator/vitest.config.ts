import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(fileURLToPath(import.meta.url))

export default {
  test: {
    include: ['test/**/*.test.ts'], exclude: ['**/dist/**'],
    // Forked SQLite/worker integration files share local process resources.
    // Bound this package's file concurrency without changing deadlines or leases.
    maxWorkers: 2,
  },
  resolve: { alias: [{ find: /^@brambodev\/contracts$/, replacement: resolve(packageRoot, '../contracts/src/index.ts') }] },
  ssr: { resolve: { conditions: ['brambo-source'] } },
}
