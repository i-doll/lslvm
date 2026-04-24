import type { LslValue } from './values/types.js'
import type { BuiltinSpec } from './generated/functions.js'
import type { VirtualClock } from './clock.js'

export type ChatType = 'say' | 'shout' | 'whisper' | 'regionSay' | 'regionSayTo' | 'ownerSay' | 'im'

export interface ChatEntry {
  readonly channel: number
  readonly text: string
  readonly type: ChatType
  /** For `regionSayTo` / `instantMessage`: the target avatar/object key. */
  readonly to?: string
}

export interface CallEntry {
  readonly name: string
  readonly args: ReadonlyArray<LslValue>
  readonly returned: LslValue | undefined
}

/**
 * Mutable state owned by a single Script instance. Built-ins and the
 * interpreter both read and write this; the public Script handle exposes
 * curated views.
 */
export interface ScriptState {
  /** Current LSL state name. Starts at "default". */
  currentState: string
  readonly chat: ChatEntry[]
  readonly calls: CallEntry[]
  readonly clock: VirtualClock
  readonly httpRequests: import('./builtins/http.js').HttpRequestEntry[]
  /** Monotonic counter feeding deterministic HTTP request keys. */
  httpKeyCounter: number
  readonly listens: import('./builtins/listen.js').ListenEntry[]
  /** Monotonic counter for llListen handles. */
  listenHandleCounter: number
}

export type BuiltinImpl = (ctx: CallContext, args: ReadonlyArray<LslValue>) => LslValue | undefined

export interface CallContext {
  readonly state: ScriptState
  readonly spec: BuiltinSpec | undefined
}
