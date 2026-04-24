import type { LslValue, Vector, Rotation } from './types.js'
import { isVector, isRotation } from './types.js'

/**
 * Format a float the way LSL prints it.
 *
 * LSL uses `%.6f`-style fixed notation for `(string)floatVal`, e.g.
 *   (string)1.5  → "1.500000"
 *   (string)0    → "0.000000"
 *   (string)1e30 → "1.000000000000000e+30" (very large/small fall back)
 *
 * For now we approximate with toFixed(6); switch-to-scientific cutoff lives
 * in Phase 4 polish.
 */
export function formatFloat(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (!Number.isFinite(n)) return n > 0 ? 'inf' : '-inf'
  return n.toFixed(6)
}

export function formatVector(v: Vector): string {
  return `<${formatFloat(v.x)}, ${formatFloat(v.y)}, ${formatFloat(v.z)}>`
}

export function formatRotation(r: Rotation): string {
  return `<${formatFloat(r.x)}, ${formatFloat(r.y)}, ${formatFloat(r.z)}, ${formatFloat(r.s)}>`
}

/** Format a list element when stringifying a list with `(string)list`.
 *  LSL concatenates element string forms WITHOUT a separator. */
export function formatListElement(v: LslValue): string {
  if (typeof v === 'number') {
    // In a list, ints stringify as ints and floats with the float format.
    // We can't tell from a raw JS number — assume float-ish if it has a fractional part.
    return Number.isInteger(v) ? String(v | 0) : formatFloat(v)
  }
  if (typeof v === 'string') return v
  if (isVector(v)) return formatVector(v)
  if (isRotation(v)) return formatRotation(v)
  if (Array.isArray(v)) return v.map(formatListElement).join('')
  return String(v)
}

export function formatList(list: ReadonlyArray<LslValue>): string {
  return list.map(formatListElement).join('')
}
