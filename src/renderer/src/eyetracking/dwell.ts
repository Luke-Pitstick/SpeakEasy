export interface DwellOptions {
  enabled: boolean
  /** How long gaze must rest on a target to select it. */
  durationMs: number
  /** Learn calibration from completed selections (see `assessSelection`). */
  learn: boolean
}

// Off by default: the app's own controls (ActionButton) handle dwell from pointer events.
export const DEFAULT_DWELL: DwellOptions = { enabled: false, durationMs: 1000, learn: false }

export interface DwellUpdate {
  /** Target currently being dwelt on. */
  target: string | null
  /** 0..1 progress toward selecting `target`. */
  progress: number
  /** Set on the frame a selection completes. */
  selected: string | null
}

/** Losing the target for less than this (tracking noise) pauses the dwell instead of resetting. */
const GRACE_MS = 200
/** Frame gaps longer than this (dropped frames) don't count toward the dwell. */
const MAX_FRAME_GAP_MS = 100

/**
 * Turns a stream of gaze targets into selections: look at a target for `durationMs` to select
 * it. Blinks pause progress. After a selection the user must look away from that target
 * before it can be selected again, so holding your gaze doesn't repeat it.
 */
export class DwellSelector {
  private current: string | null = null
  private elapsed = 0
  private lastTime: number | null = null
  private lastSeen = 0
  private cooldown: string | null = null
  private awaySince: number | null = null

  constructor(public options: DwellOptions = { ...DEFAULT_DWELL }) {}

  update(gaze: { target: string | null; blinking: boolean; timestamp: number }): DwellUpdate {
    const t = gaze.timestamp
    const dt = this.lastTime === null ? 0 : Math.min(t - this.lastTime, MAX_FRAME_GAP_MS)
    this.lastTime = t
    if (!this.options.enabled) {
      this.reset()
      return { target: null, progress: 0, selected: null }
    }
    if (gaze.blinking) return this.result()

    const target = gaze.target
    if (this.cooldown !== null) {
      if (target === this.cooldown) {
        this.awaySince = null
        return { target: null, progress: 0, selected: null }
      }
      this.awaySince ??= t
      if (t - this.awaySince >= GRACE_MS) this.cooldown = null
    }

    if (target === null && this.current !== null && t - this.lastSeen < GRACE_MS) {
      return this.result()
    }
    if (target !== this.current) {
      this.current = target
      this.elapsed = 0
    } else if (target !== null) {
      this.elapsed += dt
    }
    if (target !== null) this.lastSeen = t

    if (this.current !== null && this.elapsed >= this.options.durationMs) {
      const selected = this.current
      this.cooldown = selected
      this.awaySince = null
      this.current = null
      this.elapsed = 0
      return { target: selected, progress: 1, selected }
    }
    return this.result()
  }

  reset(): void {
    this.current = null
    this.elapsed = 0
    this.cooldown = null
    this.awaySince = null
  }

  private result(): DwellUpdate {
    return {
      target: this.current,
      progress: this.current === null ? 0 : Math.min(1, this.elapsed / this.options.durationMs),
      selected: null
    }
  }
}
