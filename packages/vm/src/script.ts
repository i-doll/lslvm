import type {
  Script as Ast,
  EventHandler,
  GlobalVariable,
  TypeName,
} from '@lf/parser'
import type { BuiltinImpl, ChatEntry, CallEntry, ScriptState } from './runtime.js'
import { execHandler } from './interpreter.js'
import type { EvalResult, LslType, LslValue } from './values/types.js'
import { Env } from './env.js'

export interface ScriptOptions {
  /** Filename used in diagnostics; defaults to "<inline>". */
  readonly filename?: string
}

/**
 * Public handle for a loaded LSL script. Tests interact almost entirely
 * with this surface: drive events via fire(), inspect chat / calls,
 * override functions via mock(), read or seed globals.
 */
export class Script {
  private readonly state: ScriptState
  private readonly mocks: Record<string, BuiltinImpl> = Object.create(null)
  private readonly globals: Env
  private readonly handlersByState: Map<string, Map<string, EventHandler>>
  private started = false

  constructor(private readonly ast: Ast) {
    this.state = {
      currentState: 'default',
      chat: [],
      calls: [],
    }
    this.globals = new Env(null)
    initGlobals(this.globals, ast.globals)
    this.handlersByState = indexHandlers(ast)
    if (!this.handlersByState.has('default')) {
      throw new Error('LSL script has no default state')
    }
  }

  /** Current LSL state name. */
  get currentState(): string {
    return this.state.currentState
  }

  /** Captured chat output (llSay/llShout/llWhisper/llOwnerSay/...). */
  get chat(): ReadonlyArray<ChatEntry> {
    return this.state.chat
  }

  /** Universal log of every ll* call this script has made. Filter with callsOf(name). */
  get calls(): ReadonlyArray<CallEntry> {
    return this.state.calls
  }

  /** Filtered call log: only entries for `name`. */
  callsOf(name: string): ReadonlyArray<CallEntry> {
    return this.state.calls.filter((c) => c.name === name)
  }

  /**
   * Override an `ll*` function for the lifetime of this Script. Replaces
   * any built-in or stub of the same name.
   */
  mock(name: string, impl: BuiltinImpl): void {
    this.mocks[name] = impl
  }

  /** Read a global variable's current value. White-box hook for tests. */
  global(name: string): LslValue {
    return this.globals.get(name).value
  }

  /** Seed a global variable. The value is coerced to the global's declared type. */
  setGlobal(name: string, value: LslValue, type?: LslType): void {
    const inferred: LslType = type ?? inferType(value)
    this.globals.set(name, { type: inferred, value } as EvalResult)
  }

  /**
   * Drive an event into the current state. Synchronous: runs the handler
   * to completion before returning. If no handler exists in the current
   * state for `eventName`, this is a no-op (matches LSL — events without
   * handlers are silently dropped).
   */
  fire(eventName: string, _payload?: unknown): void {
    if (!this.started) {
      this.started = true
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        execHandler(
          { state: this.state, mocks: this.mocks, globals: this.globals },
          entry,
        )
      }
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(eventName)
    if (!handler) return
    execHandler({ state: this.state, mocks: this.mocks, globals: this.globals }, handler)
  }

  /** Run state_entry of the default state. */
  start(): void {
    if (this.started) return
    this.started = true
    const entry = this.handlersByState.get('default')?.get('state_entry')
    if (entry) {
      execHandler({ state: this.state, mocks: this.mocks, globals: this.globals }, entry)
    }
  }
}

function indexHandlers(ast: Ast): Map<string, Map<string, EventHandler>> {
  const out = new Map<string, Map<string, EventHandler>>()
  for (const s of ast.states) {
    const map = new Map<string, EventHandler>()
    for (const h of s.handlers) {
      map.set(h.name, h)
    }
    out.set(s.name, map)
  }
  return out
}

function initGlobals(env: Env, globals: ReadonlyArray<GlobalVariable>): void {
  for (const g of globals) {
    let init: EvalResult | undefined
    if (g.init) {
      // Globals must initialize to literal expressions in LSL; we take a quick
      // shortcut here and only support literal initializers from the AST. The
      // full evaluator would require an empty interpreter context — overkill
      // for global init.
      init = literalToEval(g.init, g.typeName)
    }
    env.declare(g.name, g.typeName as LslType, init)
  }
}

function literalToEval(
  expr: import('@lf/parser').Expression,
  declared: TypeName,
): EvalResult | undefined {
  switch (expr.kind) {
    case 'IntegerLiteral':
      return { type: 'integer', value: expr.value | 0 }
    case 'FloatLiteral':
      return { type: 'float', value: expr.value }
    case 'StringLiteral':
      return { type: 'string', value: expr.value }
    case 'VectorLiteral': {
      const x = literalToNumber(expr.x)
      const y = literalToNumber(expr.y)
      const z = literalToNumber(expr.z)
      if (x === null || y === null || z === null) return undefined
      return { type: 'vector', value: { x, y, z } }
    }
    case 'RotationLiteral': {
      const x = literalToNumber(expr.x)
      const y = literalToNumber(expr.y)
      const z = literalToNumber(expr.z)
      const s = literalToNumber(expr.s)
      if (x === null || y === null || z === null || s === null) return undefined
      return { type: 'rotation', value: { x, y, z, s } }
    }
    case 'ListLiteral': {
      const elems: LslValue[] = []
      for (const el of expr.elements) {
        const r = literalToEval(el, 'integer')
        if (!r) return undefined
        elems.push(r.value)
      }
      return { type: 'list', value: elems }
    }
    case 'UnaryExpression': {
      // Permit unary minus on numeric literals — common in globals.
      const inner = literalToEval(expr.argument, declared)
      if (!inner) return undefined
      if (expr.operator === '-' && (inner.type === 'integer' || inner.type === 'float')) {
        return { ...inner, value: -(inner.value as number) }
      }
      return inner
    }
    default:
      // Richer global initializers (constants, function calls) land later.
      return undefined
  }
}

function literalToNumber(expr: import('@lf/parser').Expression): number | null {
  if (expr.kind === 'IntegerLiteral') return expr.value | 0
  if (expr.kind === 'FloatLiteral') return expr.value
  if (expr.kind === 'UnaryExpression' && expr.operator === '-') {
    const n = literalToNumber(expr.argument)
    return n === null ? null : -n
  }
  if (expr.kind === 'UnaryExpression' && expr.operator === '+') {
    return literalToNumber(expr.argument)
  }
  return null
}

function inferType(v: LslValue): LslType {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? 'integer' : 'float'
  }
  if (typeof v === 'string') return 'string'
  if (Array.isArray(v)) return 'list'
  if (v && typeof v === 'object' && 's' in v) return 'rotation'
  return 'vector'
}
