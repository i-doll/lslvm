import { readFile } from 'node:fs/promises'
import { parse, LslParseError } from '@lf/parser'
import { Script } from '@lf/vm'

export interface InlineScriptInput {
  /** LSL source code as a string. */
  readonly source: string
  /** Optional virtual filename for diagnostics; defaults to "<inline>". */
  readonly filename?: string
}

export type LoadScriptInput = string | InlineScriptInput

/**
 * Parse and instantiate an LSL script ready for testing.
 *
 * Pass a file path to load from disk, or `{ source }` for an inline string.
 * Parse errors throw `LslParseError`, which Vitest renders with the offending
 * `file:line:col`.
 */
export async function loadScript(input: LoadScriptInput): Promise<Script> {
  let source: string
  let filename: string
  if (typeof input === 'string') {
    source = await readFile(input, 'utf8')
    filename = input
  } else {
    source = input.source
    filename = input.filename ?? '<inline>'
  }
  const { script: ast, diagnostics } = parse(source, filename)
  const errors = diagnostics.filter((d) => d.severity === 'error')
  if (errors.length > 0) {
    throw new LslParseError(errors)
  }
  return new Script(ast)
}
