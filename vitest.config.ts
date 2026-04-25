import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    // Resolve workspace packages to their source TypeScript instead of the
    // built `dist/` JS. This lets vitest's transformer + coverage see the
    // real source files. Production consumers still go through `dist/` via
    // the package `exports` map.
    alias: {
      '@lslvm/parser': here('./packages/parser/src/index.ts'),
      '@lslvm/vm': here('./packages/vm/src/index.ts'),
      '@lslvm/vitest': here('./packages/vitest/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'examples/*/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Only measure our own source. Skip generated tables, dist output,
      // example LSL scripts, and the codegen helper.
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/dist/**',
        '**/generated/**',
        '**/*.d.ts',
        'packages/*/test/**',
      ],
      reportsDirectory: 'coverage',
    },
  },
})
