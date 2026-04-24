/**
 * Tiny seeded PRNG (mulberry32) — small, fast, deterministic.
 * Used for `llFrand`, `llGenerateKey`, and any other LSL function whose
 * output we want to be repeatable across test runs.
 */
export class Mulberry32 {
  private state: number

  constructor(seed: number) {
    // Coerce to uint32 in case caller passed a negative number / float.
    this.state = (seed | 0) >>> 0 || 1
  }

  /** Next float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** Float in [0, max). */
  nextFloat(max: number): number {
    return this.next() * max
  }

  /** Integer in [0, max). */
  nextInt(max: number): number {
    return Math.floor(this.nextFloat(max))
  }
}
