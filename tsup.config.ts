import { defineConfig } from 'tsup'

/**
 * Root bundle for git+https consumers.
 *
 * Inlines @lslvm/parser and @lslvm/vm into a single self-contained
 * dist/index.js so an installed package only needs `vitest` (peer) at
 * runtime. The workspace structure (packages/*) is invisible to consumers
 * — they only see the bundled root.
 */
export default defineConfig({
  entry: { index: 'packages/vitest/src/index.ts' },
  outDir: 'dist',
  format: ['esm'],
  // Use a dedicated bundle tsconfig that includes every package's src so
  // dts emission can resolve cross-package types.
  tsconfig: 'tsconfig.bundle.json',
  dts: { resolve: true },
  clean: true,
  sourcemap: true,
  target: 'node20',
  splitting: false,
  // Bundle every workspace package (parser + vm + vitest) into the output.
  noExternal: [/^@lslvm\//],
  // vitest itself is the consumer's peer dependency; do not bundle it.
  external: ['vitest'],
})
