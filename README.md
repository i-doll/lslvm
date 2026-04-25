# lslvm

A **Vitest-style test framework for LSL** (Linden Scripting Language).

Tests run in milliseconds, in-process, with a virtual clock and mockable
`ll*` calls — no Second Life or OpenSim dependency.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadScript, vm } from '@lslvm/vitest'
import type { Script } from '@lslvm/vitest'

describe('greeter.lsl', () => {
  let s: Script
  beforeEach(async () => {
    s = await loadScript('./greeter.lsl')
  })

  it('greets a toucher by name', () => {
    s.start()
    s.fire('touch_start', {
      num_detected: 1,
      detected: [{ key: 'aaa-...', name: 'Alice' }],
    })
    expect(s).toHaveSaid(0, 'Hello, Alice!')
  })

  it('reminds after 60s of silence', () => {
    s.start()
    s.fire('touch_start', { num_detected: 1, detected: [{ key: 'k', name: 'Alice' }] })
    expect(s).toBeInState('waiting')
    s.advanceTime(60_000)
    expect(s).toHaveSaid(0, 'Anyone there?')
  })
})
```

## Why

Up to now, the only way to test an LSL script has been to rez it
in-world and exercise it by hand. lslvm gives you a real type-checked
TypeScript / Vitest experience with deterministic time, mockable `ll*`
calls, and rich assertions over chat output, state transitions, HTTP
requests, and script globals.

## Packages

| Package | Purpose |
|---|---|
| `@lslvm/parser` | Hand-written recursive-descent LSL parser |
| `@lslvm/vm` | Tree-walking interpreter, virtual clock, dispatch |
| `@lslvm/vitest` | `loadScript()` + custom matchers |

## Install

### Use it from another project

Not on npm yet. Install directly from git, aliasing the package name so
your `import` lines stay clean:

```json
{
  "devDependencies": {
    "@lslvm/vitest": "github:i-doll/lslvm#release",
    "vitest": "^4.0.0"
  }
}
```

The `release` branch is auto-published by CI and ships a prebuilt
`dist/index.js` — `pnpm install` just clones it and links the bundle
into your `node_modules`. No build runs at install time, so you don't
need `pnpm approve-builds`. `vitest` is a peer dependency.

```ts
import { loadScript } from '@lslvm/vitest'
```

### Develop on lslvm itself

```sh
pnpm install
pnpm gen          # regenerate ll* stub tables from vendor/kwdb.xml
pnpm typecheck
pnpm build        # per-package tsc emit
pnpm bundle       # produce the consumer-facing dist/index.js
pnpm test
```

## API

### `loadScript(input)` → `Promise<Script>`

```ts
await loadScript('./script.lsl')
await loadScript({
  source: `default { state_entry() { llSay(0, "hi"); } }`,
  filename: 'inline.lsl',         // optional, used in diagnostics
  randomSeed: 42,                 // optional, default 1
  owner: 'aaaa-bbbb-...',         // optional, NULL_KEY default
  objectKey: 'cccc-dddd-...',     // optional, derived from filename
  objectName: 'StarterCube',      // optional, "Object" default
  scriptName: 'greeter',          // optional, derived from filename
})
```

Parse errors throw `LslParseError` with `file:line:col` location info.

### `Script` handle

```ts
// Drive events
s.start()                                       // run state_entry of default
s.fire(eventName, payload)                      // payload binds to handler params by kwdb-spec name
s.advanceTime(ms)                               // advance virtual clock; drains timer + queued events
s.deliverChat({ channel, name, key, message })  // fire `listen` on matching active listens
s.respondToHttp(key, { status, body })          // fire `http_response` for a captured llHTTPRequest
s.respondToLastHttp({ status, body })           // same, for the most recent
s.respondToDataserver(key, value)               // fire `dataserver` for a captured llRequest*
s.respondToLastDataserver(value)                // same, for the most recent
s.mock(name, impl)                              // override any ll* function (real or stubbed) per-test
s.reset()                                       // re-init globals + return to default + state_entry

// Inspect
s.currentState                                  // current LSL state name
s.now                                           // virtual time in ms
s.timerInterval                                 // configured llSetTimerEvent interval (sec, 0 = unset)
s.global(name)                                  // read a script global
s.setGlobal(name, value)                        // seed a script global
s.chat                                          // [{ channel, text, type, to? }, ...]
s.calls                                         // [{ name, args, returned }, ...]
s.callsOf(name)                                 // filter call log by ll* name
s.httpRequests                                  // [{ key, url, method, body, headers, mimetype, ... }]
s.dataserverRequests                            // [{ key, source, args, fulfilled }]
s.listens                                       // [{ handle, channel, name, key, message, active }]
s.linkedMessages                                // [{ target, num, str, id }]
s.text                                          // current llSetText: { text, color, alpha } or null
s.objectDesc                                    // current llSetObjectDesc value
s.dead                                          // true once llDie has run
```

### Custom matchers

```ts
expect(s).toHaveSaid(0, 'hello')
expect(s).toBeInState('waiting')
expect(s).toHaveCalledFunction('llSetTimerEvent', 60.0)
expect(s).toHaveSentHTTP({ url: '...', method: 'POST', body: '...' })
expect(s).toHaveListened(7, { key: ownerKey })
```

### Implemented `ll*` functions

The current real-impl set covers the most common use cases (~100 of
LSL's ~520 SL functions). Anything outside this set falls through to
a typed stub. Use `s.mock(name, fn)` to provide your own behaviour
for any function the script under test calls.

* **chat**: `llSay`, `llShout`, `llWhisper`, `llOwnerSay`
* **listen**: `llListen`, `llListenRemove`, `llListenControl`
* **time**: `llSetTimerEvent`, `llSleep`, `llGetTime`, `llGetAndResetTime`, `llResetTime`
* **HTTP**: `llHTTPRequest`, `llHTTPResponse`
* **linked**: `llMessageLinked`
* **dataserver**: `llRequestAgentData`, `llRequestInventoryData`, `llRequestSimulatorData`, `llRequestUsername`, `llRequestDisplayName`
* **detected**: `llDetectedKey`/`Name`/`Owner`/`Group`/`Pos`/`Rot`/`Vel`/`Type`/`LinkNumber`/`Grab`/`TouchPos`
* **math**: `llAbs`, `llFabs`, `llRound` (banker's), `llCeil`, `llFloor`, `llPow`, `llSqrt`, `llSin`/`Cos`/`Tan`/`Asin`/`Acos`/`Atan2`, `llLog`/`Log10`, seeded `llFrand`, `llVecMag`/`Norm`/`Dist`, `llRot2Euler`/`Euler2Rot`
* **string**: `llStringLength`, `llSubStringIndex`, `llGetSubString`, `llDeleteSubString`, `llInsertString`, `llStringTrim`, `llToLower`/`Upper`, `llReplaceSubString`, `llEscapeURL`/`UnescapeURL`
* **list**: `llGetListLength`, `llList2Integer`/`Float`/`String`/`Key`/`Vector`/`Rot`, `llList2List`, `llDeleteSubList`, `llListInsertList`, `llListReplaceList`, `llListFindList`, `llDumpList2String`, `llCSV2List`, `llParseString2List`
* **identity**: `llGetOwner`, `llGetCreator`, `llGetKey`, `llGetObjectName`, `llSetObjectName`, `llGetScriptName`
* **hash**: `llMD5String`, `llSHA1String`, `llSHA256String`, `llHMAC`
* **base64**: `llStringToBase64`/`Base64ToString`, `llIntegerToBase64`/`Base64ToInteger`
* **object**: `llSetText`, `llSetObjectDesc`, `llGetObjectDesc`, `llDie`, `llResetScript`

## Examples

`examples/` ships six working scripts with tests:

* **hello** — minimal `state_entry { llSay(...) }` + matchers.
* **greeter** — touch + name greeting + state transition + reminder timer.
* **remote** — owner-only listen on a custom channel + command dispatch.
* **fetcher** — `llHTTPRequest` + `http_response` + status handling.
* **nametag** — `llRequestAgentData` + `dataserver` + floating text.
* **mocking** — patterns for `script.mock(...)`: pinning a real built-in
  to a deterministic value, providing custom logic for an unimplemented
  function, observing call args via the call log, and stateful mocks
  that aggregate across multiple events.

## License

The lslvm project is licensed under the **Apache License, Version 2.0** —
see [`LICENSE`](LICENSE).

LSL function/event/constant signatures come from
[Sei-Lisa/kwdb](https://github.com/Sei-Lisa/kwdb), vendored at
`vendor/kwdb.xml` and licensed under **LGPL-3.0-or-later**. Files
mechanically derived from it (`packages/vm/src/generated/*.ts`) remain
under that licence; see [`NOTICE`](NOTICE) for the full attribution.

Apache 2.0 is one-way compatible with LGPL-3 (per the FSF), so a
combined work that includes both can be redistributed under LGPL-3
terms — which is what consumers receive when they use lslvm.
