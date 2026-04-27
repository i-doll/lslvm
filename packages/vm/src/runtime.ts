import type { LslValue } from './values/types.js'
import type { BuiltinSpec } from './generated/functions.js'
import type { VirtualClock } from './clock.js'
import type { Mulberry32 } from './random.js'

/** Script-identity values exposed via llGetOwner / llGetKey / etc. */
export interface ScriptIdentity {
  /** Configured via loadScript({ owner }); defaults to NULL_KEY. */
  readonly owner: string
  /** Prim key — defaults to a deterministic key derived from filename. */
  readonly objectKey: string
  objectName: string
  readonly scriptName: string
}

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
  readonly random: Mulberry32
  identity: ScriptIdentity
  readonly linkedMessages: import('./builtins/linked.js').LinkedMessageEntry[]
  readonly dataserverRequests: import('./builtins/dataserver.js').DataserverRequestEntry[]
  /** Monotonic counter for dataserver request keys. */
  dataserverKeyCounter: number
  /**
   * Stack of detected contexts pushed during touch / sensor / collision
   * handler invocation. Top-of-stack is the active context for llDetected*.
   */
  readonly detectedStack: import('./builtins/detected.js').DetectedContext[]
  /**
   * Linkset Data store. Per-linkset key/value strings written via
   * llLinksetDataWrite / llLinksetDataWriteProtected. Survives llResetScript
   * (the LSD store is owned by the linkset, not the script). `password === ''`
   * means the entry is unprotected. Map insertion order matches the LSL
   * contract that llLinksetDataListKeys returns keys in write order.
   */
  readonly linksetData: Map<string, import('./builtins/linksetdata.js').LinksetDataEntry>
  /**
   * Mutable prim appearance — set by llSetText / llSetObjectDesc / etc.
   * and exposed as Script.text / Script.objectDesc.
   */
  appearance: {
    text: { text: string; color: { x: number; y: number; z: number }; alpha: number } | null
    description: string
  }
  /** Lifecycle flags — `dead` is set when llDie runs. */
  lifecycle: {
    dead: boolean
  }
}

export type BuiltinImpl = (ctx: CallContext, args: ReadonlyArray<LslValue>) => LslValue | undefined

export interface CallContext {
  readonly state: ScriptState
  readonly spec: BuiltinSpec | undefined
}
