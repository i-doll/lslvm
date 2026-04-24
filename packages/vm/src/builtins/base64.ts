import type { BuiltinImpl } from '../runtime.js'
import { toInt32 } from '../values/types.js'

/**
 * Base64 encode/decode builtins. LSL's base64 alphabet matches RFC 4648
 * standard (Node's `Buffer` default). Padding behaviour: LSL pads with `=`,
 * which Buffer also produces.
 */

export const llStringToBase64: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  return Buffer.from(s, 'utf8').toString('base64')
}

export const llBase64ToString: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  // LSL silently tolerates malformed input; Buffer does too.
  return Buffer.from(s, 'base64').toString('utf8')
}

/**
 * llIntegerToBase64(integer x) — encodes the 32-bit big-endian
 * representation of x as 6 base64 chars (24 bits → 4 chars × 6 bits, padded
 * to 4 chars per encoding round). LSL's specific output is 8 chars: e.g.
 *   llIntegerToBase64(0)    → "AAAAAA=="
 *   llIntegerToBase64(0xFF) → "AAAA/w=="  (no — actually "/w==" right-aligned)
 *
 * The reference output is the standard base64 encoding of the 4-byte
 * big-endian integer.
 */
export const llIntegerToBase64: BuiltinImpl = (_ctx, args) => {
  const x = toInt32((args[0] as number | undefined) ?? 0)
  const buf = Buffer.alloc(4)
  buf.writeInt32BE(x, 0)
  return buf.toString('base64')
}

/**
 * llBase64ToInteger(string s) — inverse of llIntegerToBase64.
 * Returns 0 if the input doesn't decode to at least 4 bytes.
 */
export const llBase64ToInteger: BuiltinImpl = (_ctx, args) => {
  const s = (args[0] as string | undefined) ?? ''
  const buf = Buffer.from(s, 'base64')
  if (buf.length < 4) return 0
  return buf.readInt32BE(0)
}
