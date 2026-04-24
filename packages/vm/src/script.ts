import type { Script as Ast, EventHandler, State as AstState } from '@lf/parser'
import type { BuiltinImpl, ChatEntry, CallEntry, ScriptState } from './runtime.js'
import { execHandler } from './interpreter.js'

export interface ScriptOptions {
  /** Filename used in diagnostics; defaults to "<inline>". */
  readonly filename?: string
}

/**
 * Public handle for a loaded LSL script. Tests interact almost entirely
 * with this surface: drive events via fire(), inspect chat / calls,
 * override functions via mock(), read globals (Phase 2).
 */
export class Script {
  private readonly state: ScriptState
  private readonly mocks: Record<string, BuiltinImpl> = Object.create(null)
  private readonly handlersByState: Map<string, Map<string, EventHandler>>
  private started = false

  constructor(private readonly ast: Ast) {
    this.state = {
      currentState: 'default',
      chat: [],
      calls: [],
    }
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
   * any built-in or stub of the same name. Useful for injecting deterministic
   * dataserver / HTTP responses, or for asserting on raw call args.
   */
  mock(name: string, impl: BuiltinImpl): void {
    this.mocks[name] = impl
  }

  /**
   * Drive an event into the current state. Synchronous: runs the handler
   * to completion before returning. If no handler exists in the current
   * state for `eventName`, this is a no-op (matches LSL — events without
   * handlers are silently dropped).
   */
  fire(eventName: string, _payload?: unknown): void {
    if (!this.started) {
      // LSL fires state_entry on script load. Phase 1: do it lazily on first fire.
      this.started = true
      const entry = this.handlersByState.get(this.state.currentState)?.get('state_entry')
      if (entry && eventName !== 'state_entry') {
        execHandler({ state: this.state, mocks: this.mocks }, entry)
      }
    }
    const handler = this.handlersByState.get(this.state.currentState)?.get(eventName)
    if (!handler) return
    execHandler({ state: this.state, mocks: this.mocks }, handler)
  }

  /** Run state_entry of the default state. Useful when a test wants the
   * script to bootstrap without firing another event first. */
  start(): void {
    if (this.started) return
    this.started = true
    const entry = this.handlersByState.get('default')?.get('state_entry')
    if (entry) {
      execHandler({ state: this.state, mocks: this.mocks }, entry)
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

export type { AstState }
