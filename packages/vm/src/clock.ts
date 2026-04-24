/**
 * Virtual clock + event queue.
 *
 * The clock is the only source of "time" in the VM. Tests advance it
 * explicitly (`vm.advanceTime`); LSL scripts advance it by calling `llSleep`
 * or `llSetTimerEvent`. Real wall-clock time is never read.
 *
 * The queue holds three kinds of pending work, all keyed on a virtual ms
 * timestamp:
 *   * one-shot events scheduled by builtins (e.g. dataserver responses)
 *   * the next firing of a recurring `llSetTimerEvent`
 *   * delivered events that arrived while a handler was sleeping
 *
 * The queue is intentionally a flat array; we sort lazily on read. With
 * realistic LSL scripts the queue is tiny (single-digit entries), so the
 * cost is negligible compared to the simplicity of not maintaining a heap.
 */

export interface QueuedEvent {
  /** Virtual ms timestamp at which this event becomes ready to fire. */
  readonly at: number
  readonly event: string
  readonly payload: Record<string, unknown>
}

export class VirtualClock {
  /** Virtual milliseconds since script construction. Strictly monotonic. */
  now = 0
  /**
   * Reference time for `llGetTime` / `llResetTime` (in ms). Defaults to 0
   * (script construction); `llResetTime` updates it to `now`.
   */
  timeReferenceMs = 0
  /**
   * Recurring timer interval in ms; 0 means no timer is registered.
   */
  timerIntervalMs = 0
  /**
   * Virtual time at which the timer event fires next. Only meaningful when
   * `timerIntervalMs > 0`.
   */
  timerNextFireMs = 0

  private readonly queue: QueuedEvent[] = []

  /** Schedule a one-shot event to fire at `at`. */
  schedule(at: number, event: string, payload: Record<string, unknown> = {}): void {
    this.queue.push({ at, event, payload })
  }

  /** Cancel the recurring timer. */
  cancelTimer(): void {
    this.timerIntervalMs = 0
    this.timerNextFireMs = 0
  }

  /** (Re)arm the recurring timer. `intervalMs <= 0` cancels. */
  setTimer(intervalMs: number): void {
    if (intervalMs <= 0) {
      this.cancelTimer()
      return
    }
    this.timerIntervalMs = intervalMs
    this.timerNextFireMs = this.now + intervalMs
  }

  /**
   * Pop and return the next event whose `at <= now`, or `null` if none are
   * ready. Recurring timer entries are produced lazily — when the timer is
   * the next ready event, this returns a synthetic `'timer'` event and
   * advances `timerNextFireMs` to the following interval.
   */
  takeNextDue(): QueuedEvent | null {
    let bestIdx = -1
    let bestAt = Infinity
    for (let i = 0; i < this.queue.length; i++) {
      const e = this.queue[i]!
      if (e.at <= this.now && e.at < bestAt) {
        bestAt = e.at
        bestIdx = i
      }
    }
    const timerDue =
      this.timerIntervalMs > 0 && this.timerNextFireMs <= this.now
        ? this.timerNextFireMs
        : Infinity

    if (bestIdx === -1 && !Number.isFinite(timerDue)) return null

    if (timerDue <= bestAt) {
      // Synthesise a timer event; schedule the next one at `at + interval`,
      // not `now + interval`, so that long advances catch up on every
      // missed fire instead of collapsing them into one.
      const at = this.timerNextFireMs
      this.timerNextFireMs = at + this.timerIntervalMs
      return { at, event: 'timer', payload: {} }
    }
    const ev = this.queue[bestIdx]!
    this.queue.splice(bestIdx, 1)
    return ev
  }

  /** Move the clock forward unconditionally; does not drain queues. */
  advance(ms: number): void {
    if (ms < 0) throw new Error('cannot advance time backwards')
    this.now += ms
  }

  /** Elapsed time (in seconds) since `timeReferenceMs`, per `llGetTime`. */
  elapsedSeconds(): number {
    return (this.now - this.timeReferenceMs) / 1000
  }

  /** Snapshot the current `now` as the reference point (per `llResetTime`). */
  resetReference(): void {
    this.timeReferenceMs = this.now
  }
}
