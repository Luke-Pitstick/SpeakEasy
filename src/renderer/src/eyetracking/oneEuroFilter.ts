/**
 * One Euro filter (Casiez et al. 2012): heavy smoothing while the gaze is still, low lag
 * during fast saccades.
 */
class LowPass {
  private value: number | null = null

  apply(x: number, alpha: number): number {
    this.value = this.value === null ? x : alpha * x + (1 - alpha) * this.value
    return this.value
  }

  get last(): number | null {
    return this.value
  }

  reset(): void {
    this.value = null
  }
}

const alpha = (cutoff: number, dt: number): number => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt))

export class OneEuroFilter {
  private readonly x = new LowPass()
  private readonly dx = new LowPass()
  private lastTime: number | null = null

  /**
   * @param minCutoff Hz; lower = smoother when still.
   * @param beta Speed coefficient; higher = less lag when moving.
   * @param dCutoff Hz cutoff for the derivative estimate.
   */
  constructor(
    private readonly minCutoff = 0.8,
    private readonly beta = 0.004,
    private readonly dCutoff = 1
  ) {}

  /** @param timestamp Milliseconds. */
  filter(value: number, timestamp: number): number {
    const dt = this.lastTime === null ? 1 / 30 : Math.max((timestamp - this.lastTime) / 1000, 1e-3)
    this.lastTime = timestamp
    const prev = this.x.last
    const d = prev === null ? 0 : (value - prev) / dt
    const edx = this.dx.apply(d, alpha(this.dCutoff, dt))
    const cutoff = this.minCutoff + this.beta * Math.abs(edx)
    return this.x.apply(value, alpha(cutoff, dt))
  }

  reset(): void {
    this.x.reset()
    this.dx.reset()
    this.lastTime = null
  }
}
