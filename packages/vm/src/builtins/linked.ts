import type { BuiltinImpl } from '../runtime.js'

/**
 * Captured llMessageLinked invocation. In our single-script-per-prim model
 * the link target only really controls self-delivery; we still record every
 * call so tests can assert on the full set.
 */
export interface LinkedMessageEntry {
  readonly target: number
  readonly num: number
  readonly str: string
  readonly id: string
}

/** LSL link target sentinels (subset). */
const LINK_SET = -1
const LINK_ALL_OTHERS = -2
const LINK_ALL_CHILDREN = -3
const LINK_THIS = -4

/**
 * llMessageLinked(integer link, integer num, string str, key id)
 *
 * Captures every call into ScriptState.linkedMessages. In our single-prim
 * model the message also delivers to ourselves unless the target is
 * LINK_ALL_OTHERS or LINK_ALL_CHILDREN (since there are no others to
 * receive). All other targets — LINK_THIS, LINK_SET, link 1 — self-deliver.
 */
export const llMessageLinked: BuiltinImpl = (ctx, args) => {
  const target = (args[0] as number | undefined) ?? LINK_THIS
  const num = (args[1] as number | undefined) ?? 0
  const str = (args[2] as string | undefined) ?? ''
  const id = (args[3] as string | undefined) ?? ''
  ctx.state.linkedMessages.push({ target, num, str, id })
  if (target === LINK_ALL_OTHERS || target === LINK_ALL_CHILDREN) {
    return undefined
  }
  ctx.state.clock.schedule(ctx.state.clock.now, 'link_message', {
    sender_num: 0,
    num,
    str,
    id,
  })
  return undefined
}
