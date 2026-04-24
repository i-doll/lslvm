import type { BuiltinImpl, CallContext, ScriptState } from './runtime.js'
import type { LslValue } from './values/types.js'
import { defaultValueFor } from './values/types.js'
import { BUILTIN_SPECS } from './generated/functions.js'
import type { BuiltinSpec } from './generated/functions.js'
import { REAL_BUILTINS } from './builtins/index.js'

/** Look up the kwdb-derived spec for a function name, if any. */
export function specFor(name: string): BuiltinSpec | undefined {
  return (BUILTIN_SPECS as Record<string, BuiltinSpec>)[name]
}

/**
 * Resolve and invoke an `ll*` function call.
 *
 * Resolution order: user mock > real built-in > generated stub > error.
 * Every successful call (including stubs) is appended to ScriptState.calls.
 */
export function callBuiltin(
  state: ScriptState,
  mocks: Readonly<Record<string, BuiltinImpl>>,
  name: string,
  args: ReadonlyArray<LslValue>,
): LslValue | undefined {
  const spec = specFor(name)
  const impl = mocks[name] ?? REAL_BUILTINS[name] ?? makeStub(name)
  const ctx: CallContext = { state, spec }
  const result = impl(ctx, args)
  state.calls.push({ name, args, returned: result })
  return result
}

function makeStub(name: string): BuiltinImpl {
  const spec = specFor(name)
  if (!spec) {
    return () => {
      throw new Error(`unknown LSL function '${name}' (not in kwdb; use script.mock to provide it)`)
    }
  }
  return () => defaultValueFor(spec.returnType)
}
