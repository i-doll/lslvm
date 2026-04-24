import type {
  Script as Ast,
  EventHandler,
  FunctionDeclaration,
  GlobalVariable,
  TypeName,
} from '@lf/parser'
import type { BuiltinImpl, ChatEntry, CallEntry, ScriptState } from './runtime.js'
import { execHandler, StateChangeSignal } from './interpreter.js'
import type { EvalResult, LslType, LslValue } from './values/types.js'
import { defaultEvalFor } from './values/types.js'
import { Env } from './env.js'
import { VirtualClock } from './clock.js'
import { EVENT_SPECS } from './generated/events.js'
import type { EventSpec } from './generated/events.js'

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
  private readonly userFunctions: Map<string, FunctionDeclaration>
  private readonly handlersByState: Map<string, Map<string, EventHandler>>
  private started = false

  constructor(private readonly ast: Ast) {
    this.state = {
      currentState: 'default',
      chat: [],
      calls: [],
      clock: new VirtualClock(),
    }
    this.globals = new Env(null)
    initGlobals(this.globals, ast.globals)
    this.userFunctions = new Map(ast.functions.map((f) => [f.name, f]))
    this.handlersByState = indexHandlers(ast)
    if (!this.handlersByState.has('default')) {
      throw new Error('LSL script has no default state')
    }
  }

  /** Current virtual time in milliseconds since script construction. */
  get now(): number {
    return this.state.clock.now
  }

  /**
   * Advance the virtual clock by `ms` and fire every queued event whose
   * scheduled time is ≤ the new now (in chronological order). Use this
   * to test timer-driven, sleep-driven, or future-callback behaviour.
   */
  advanceTime(ms: number): void {
    this.state.clock.advance(ms)
    this.drainQueue()
  }

  /**
   * Configured recurring timer interval in seconds, or 0 if no timer is
   * registered. Mirrors `llSetTimerEvent`'s most recent argument.
   */
  get timerInterval(): number {
    return this.state.clock.timerIntervalMs / 1000
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
   * Drive an event into the current state.
   *
   * `payload` is keyed by the event's documented parameter names (per kwdb).
   * The handler's declared parameters bind by position to the event spec, so
   * the user's chosen names don't have to match.
   *
   * Synchronous: runs the handler to completion before returning, including
   * any state transitions triggered by `state foo;` (state_exit / change /
   * state_entry chain runs before fire() returns).
   *
   * If the current state has no handler for `eventName`, this is a no-op
   * — matches LSL behavior of silently dropping unhandled events.
   */
  fire(eventName: string, payload: Record<string, unknown> = {}): void {
    if (!this.started) {
      this.started = true
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        this.runHandler(entry, [])
        this.drainQueue()
      }
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(eventName)
    if (handler) {
      const args = bindPayload(eventName, payload)
      this.runHandler(handler, args)
    }
    this.drainQueue()
  }

  /** Run state_entry of the default state. */
  start(): void {
    if (this.started) return
    this.started = true
    const entry = this.handlersByState.get('default')?.get('state_entry')
    if (entry) {
      this.runHandler(entry, [])
    }
    this.drainQueue()
  }

  /**
   * Drain any events that became due as a result of the clock advancing
   * (timer ticks, scheduled callbacks, queued handler invocations).
   * Called automatically after fire() and advanceTime().
   */
  private drainQueue(): void {
    while (true) {
      const next = this.state.clock.takeNextDue()
      if (!next) return
      const handler = this.handlersByState.get(this.state.currentState)?.get(next.event)
      if (!handler) continue
      const args = bindPayload(next.event, next.payload)
      this.runHandler(handler, args)
    }
  }

  /**
   * Run a handler and process any state-change signal it raises.
   *
   * LSL semantics: when a handler executes `state foo;`, control leaves the
   * handler immediately, the current state's `state_exit` fires, the state
   * changes, then the new state's `state_entry` fires. We mirror that here
   * with a small loop so that a `state_exit` or `state_entry` that itself
   * does `state foo;` continues the chain correctly.
   */
  private runHandler(handler: EventHandler, args: ReadonlyArray<EvalResult>): void {
    const ctx = {
      state: this.state,
      mocks: this.mocks,
      globals: this.globals,
      userFunctions: this.userFunctions,
    }
    let pending: { handler: EventHandler; args: ReadonlyArray<EvalResult> } | null = {
      handler,
      args,
    }
    while (pending) {
      const { handler: h, args: a } = pending
      pending = null
      try {
        execHandler(ctx, h, a)
      } catch (e) {
        if (!(e instanceof StateChangeSignal)) throw e
        const target = e.target
        // Run state_exit of current state.
        const exit = this.handlersByState.get(this.state.currentState)?.get('state_exit')
        if (exit) {
          try {
            execHandler(ctx, exit, [])
          } catch (e2) {
            if (e2 instanceof StateChangeSignal) {
              // Discard further changes inside state_exit per LSL convention;
              // the original target wins.
            } else {
              throw e2
            }
          }
        }
        if (!this.handlersByState.has(target)) {
          throw new Error(`unknown state '${target}' in state change`)
        }
        this.state.currentState = target
        const entry = this.handlersByState.get(target)?.get('state_entry')
        if (entry) {
          pending = { handler: entry, args: [] }
        }
      }
    }
  }
}

function bindPayload(
  eventName: string,
  payload: Record<string, unknown>,
): EvalResult[] {
  const spec = (EVENT_SPECS as Record<string, EventSpec>)[eventName]
  if (!spec) return [] // unknown / custom event — let the handler bind however it wants
  const args: EvalResult[] = []
  for (const p of spec.params) {
    const v = payload[p.name]
    if (v === undefined) {
      args.push(defaultEvalFor(p.type as LslType))
    } else {
      args.push({ type: p.type as LslType, value: v as LslValue })
    }
  }
  return args
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
      const inner = literalToEval(expr.argument, declared)
      if (!inner) return undefined
      if (expr.operator === '-' && (inner.type === 'integer' || inner.type === 'float')) {
        return { ...inner, value: -(inner.value as number) }
      }
      return inner
    }
    default:
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
