import { expect } from 'vitest'
import type { Script } from '@lf/vm'

/**
 * Custom Vitest matchers for the LSL Script handle.
 *
 * Each matcher checks one observable on the Script and returns a Vitest
 * MatcherResult; pass `.not.` to invert. Failure messages include the actual
 * captured state to make debugging quick.
 */

interface MatcherResult {
  pass: boolean
  message: () => string
  actual?: unknown
  expected?: unknown
}

function isScript(value: unknown): value is Script {
  return (
    typeof value === 'object' &&
    value !== null &&
    'chat' in value &&
    'currentState' in value &&
    'callsOf' in value
  )
}

expect.extend({
  toHaveSaid(received: unknown, channel: number, text: string): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const matched = received.chat.some((c) => c.channel === channel && c.text === text)
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have said ${JSON.stringify(text)} on channel ${channel}`
          : `expected script to have said ${JSON.stringify(text)} on channel ${channel}\n  actual chat: ${JSON.stringify(received.chat, null, 2)}`,
      actual: received.chat,
      expected: { channel, text },
    }
  },

  toBeInState(received: unknown, name: string): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const pass = received.currentState === name
    return {
      pass,
      message: () =>
        pass
          ? `expected script not to be in state '${name}'`
          : `expected script to be in state '${name}', actual: '${received.currentState}'`,
      actual: received.currentState,
      expected: name,
    }
  },

  toHaveCalledFunction(received: unknown, name: string, ...args: unknown[]): MatcherResult {
    if (!isScript(received)) {
      return {
        pass: false,
        message: () => `expected a Script, received ${typeof received}`,
      }
    }
    const calls = received.callsOf(name)
    if (calls.length === 0) {
      return {
        pass: false,
        message: () => `expected script to have called ${name}, but it was never called`,
      }
    }
    if (args.length === 0) {
      return {
        pass: true,
        message: () => `expected script not to have called ${name}`,
      }
    }
    const matched = calls.some(
      (c) =>
        c.args.length === args.length &&
        c.args.every((a, i) => Object.is(a, args[i]) || JSON.stringify(a) === JSON.stringify(args[i])),
    )
    return {
      pass: matched,
      message: () =>
        matched
          ? `expected script not to have called ${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`
          : `expected script to have called ${name}(${args.map((a) => JSON.stringify(a)).join(', ')})\n  actual calls: ${JSON.stringify(calls, null, 2)}`,
      actual: calls,
      expected: { name, args },
    }
  },
})

declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveSaid(channel: number, text: string): T
    toBeInState(name: string): T
    toHaveCalledFunction(name: string, ...args: unknown[]): T
  }
  interface AsymmetricMatchersContaining {
    toHaveSaid(channel: number, text: string): unknown
    toBeInState(name: string): unknown
    toHaveCalledFunction(name: string, ...args: unknown[]): unknown
  }
}
