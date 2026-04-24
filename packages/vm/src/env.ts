import type { EvalResult, LslType } from './values/types.js'
import { defaultEvalFor } from './values/types.js'
import { coerce } from './values/coerce.js'

interface Slot {
  type: LslType
  value: EvalResult
}

/**
 * Lexical environment with a single parent pointer. The interpreter pushes
 * a new env when entering a block / handler and discards on exit. Globals
 * live at the bottom of the chain and persist for the lifetime of the script.
 */
export class Env {
  private readonly slots = new Map<string, Slot>()

  constructor(private readonly parent: Env | null = null) {}

  /** Declare a new variable in the current scope. Coerces init to declared type. */
  declare(name: string, type: LslType, init?: EvalResult): void {
    if (this.slots.has(name)) {
      throw new Error(`variable '${name}' already declared in this scope`)
    }
    const value = init ? coerce(init, type) : defaultEvalFor(type)
    this.slots.set(name, { type, value })
  }

  /** Get a variable's current value. Walks up the parent chain. */
  get(name: string): EvalResult {
    const slot = this.findSlot(name)
    if (!slot) throw new Error(`undefined variable '${name}'`)
    return slot.value
  }

  /** Assign to an existing variable. Coerces to declared type. */
  set(name: string, value: EvalResult): EvalResult {
    const slot = this.findSlot(name)
    if (!slot) throw new Error(`undefined variable '${name}'`)
    slot.value = coerce(value, slot.type)
    return slot.value
  }

  hasOwn(name: string): boolean {
    return this.slots.has(name)
  }

  /** Open a child scope. */
  push(): Env {
    return new Env(this)
  }

  private findSlot(name: string): Slot | null {
    let env: Env | null = this
    while (env) {
      const s = env.slots.get(name)
      if (s) return s
      env = env.parent
    }
    return null
  }
}
