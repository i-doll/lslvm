# Logical Firefly

A **Vitest-style test framework for LSL** (Linden Scripting Language).

Tests run in milliseconds, in-process, with a virtual clock and mockable
`ll*` calls — no Second Life or OpenSim dependency.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript, vm } from '@lf/vitest'
import type { Script } from '@lf/vitest'

describe('greeter.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript('./greeter.lsl')
  })

  it('greets a toucher by name', () => {
    s.fire('touch_start', { detected: [{ key: 'a-key', name: 'Alice' }] })
    expect(s).toHaveSaid(0, 'Hello, Alice!')
  })

  it('reminds after 60s of silence', () => {
    s.fire('touch_start', { detected: [{ key: 'a-key', name: 'Alice' }] })
    expect(s).toBeInState('waiting')
    vm.advanceTime(60_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
  })
})
```

## Status

Early work in progress. See `docs/superpowers/specs/` (or the design plan)
for the full roadmap.

| Phase | What | Status |
|---|---|---|
| 0 | Workspace skeleton + kwdb codegen | done |
| 1 | End-to-end "Hello, world" pipeline | done |
| 2 | Full LSL grammar + types + control flow | todo |
| 3 | Real `ll*` implementations (~50) | todo |
| 4 | Polish, docs, publish | todo |

## Packages

| Package | Purpose |
|---|---|
| `@lf/parser` | Hand-written recursive-descent LSL parser |
| `@lf/vm` | Tree-walking interpreter, virtual clock, dispatch |
| `@lf/vitest` | `loadScript()` + custom matchers (`toHaveSaid`, `toBeInState`, …) |

## Develop

```sh
pnpm install
pnpm gen        # regenerate ll* stub tables from vendor/kwdb.xml
pnpm typecheck
pnpm build
pnpm test
```

## Acknowledgements

LSL function/event/constant signatures come from
[Sei-Lisa/kwdb](https://github.com/Sei-Lisa/kwdb), vendored at
`vendor/kwdb.xml` (LGPL-3.0).
