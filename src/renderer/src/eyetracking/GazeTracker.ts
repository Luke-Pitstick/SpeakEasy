import { GazeModel, type GazeModelData } from './gazeModel'
import { OneEuroFilter } from './oneEuroFilter'
import { WebcamFaceSource } from './WebcamFaceSource'
import type { CalibrationResult, EyeFeatures, GazePoint, TrackerStatus } from './types'

const STORAGE_KEY = 'speakeasy.gazeCalibration.v1'
/** Eyes count as closed when openness drops below this fraction of the open-eye baseline. */
const BLINK_RATIO = 0.55

export interface TrackerState {
  status: TrackerStatus
  error: string | null
  faceDetected: boolean
  calibrated: boolean
}

export interface CalibrationSample {
  feature: number[]
  /** Screen-space target the user was looking at. */
  target: [number, number]
}

// Calibration is stored in screen coordinates so it stays valid when the window moves.
export function clientToScreen(x: number, y: number): [number, number] {
  return [x + window.screenX, y + window.screenY + (window.outerHeight - window.innerHeight)]
}

export function screenToClient(x: number, y: number): [number, number] {
  return [x - window.screenX, y - window.screenY - (window.outerHeight - window.innerHeight)]
}

function loadModel(): GazeModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? GazeModel.fromJSON(JSON.parse(raw) as GazeModelData) : null
  } catch {
    return null
  }
}

/**
 * Turns webcam eye features into a smoothed on-screen gaze point.
 *
 * Usage: `start()`, run a calibration (`collectSamples` per target, then `calibrate`),
 * then listen with `onGaze`.
 */
export class GazeTracker {
  private readonly source = new WebcamFaceSource((f) => this.handleFeatures(f))
  private model: GazeModel | null = loadModel()
  private readonly filterX = new OneEuroFilter()
  private readonly filterY = new OneEuroFilter()
  private openBaseline: number | null = null
  private collector: ((f: EyeFeatures) => void) | null = null
  private lastGaze: GazePoint | null = null
  private readonly gazeListeners = new Set<(gaze: GazePoint) => void>()
  private readonly stateListeners = new Set<() => void>()
  private state: TrackerState = {
    status: 'idle',
    error: null,
    faceDetected: false,
    calibrated: this.model !== null
  }

  /** The live camera stream while running, for previews. */
  get mediaStream(): MediaStream | null {
    return this.source.mediaStream
  }

  get latestGaze(): GazePoint | null {
    return this.lastGaze
  }

  getState = (): TrackerState => this.state

  /** Subscribe to state changes (compatible with React's useSyncExternalStore). */
  subscribe = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  /** Subscribe to gaze updates, emitted once per camera frame while calibrated. */
  onGaze(listener: (gaze: GazePoint) => void): () => void {
    this.gazeListeners.add(listener)
    return () => this.gazeListeners.delete(listener)
  }

  async start(): Promise<void> {
    if (this.state.status === 'running' || this.state.status === 'loading') return
    this.setState({ status: 'loading', error: null })
    try {
      await this.source.start()
      // stop() may have run while the camera was starting.
      if (this.getState().status === 'loading') this.setState({ status: 'running' })
    } catch (err) {
      this.source.stop()
      this.setState({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }

  stop(): void {
    this.source.stop()
    this.setState({ status: 'idle', faceDetected: false })
  }

  /**
   * Records eye features while the user looks at a point, skipping blinks.
   *
   * @param clientX Target x in window CSS pixels.
   * @param clientY Target y in window CSS pixels.
   * @param durationMs How long to record.
   */
  collectSamples(
    clientX: number,
    clientY: number,
    durationMs: number
  ): Promise<CalibrationSample[]> {
    const target = clientToScreen(clientX, clientY)
    const samples: CalibrationSample[] = []
    const collector = (f: EyeFeatures): void => {
      samples.push({ feature: f.vector, target })
    }
    this.collector = collector
    return new Promise((resolve) =>
      setTimeout(() => {
        if (this.collector === collector) this.collector = null
        resolve(samples)
      }, durationMs)
    )
  }

  /** Fits a new gaze model from calibration samples and persists it. */
  calibrate(samples: CalibrationSample[]): void {
    if (samples.length < 20) throw new Error('Not enough calibration data — is your face visible?')
    this.model = GazeModel.fit(
      samples.map((s) => s.feature),
      samples.map((s) => s.target)
    )
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.model.toJSON()))
    } catch {
      // Calibration still works for this session without persistence.
    }
    this.filterX.reset()
    this.filterY.reset()
    this.setState({ calibrated: true })
  }

  /** Measures accuracy of the current model on samples it was not trained on. */
  evaluate(samples: CalibrationSample[]): CalibrationResult {
    if (!this.model || samples.length === 0) return { meanErrorPx: NaN, sampleCount: 0 }
    const total = samples.reduce((sum, s) => {
      const [x, y] = this.model!.predict(s.feature)
      return sum + Math.hypot(x - s.target[0], y - s.target[1])
    }, 0)
    return { meanErrorPx: total / samples.length, sampleCount: samples.length }
  }

  clearCalibration(): void {
    this.model = null
    this.lastGaze = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing persisted.
    }
    this.setState({ calibrated: false })
  }

  private handleFeatures(features: EyeFeatures | null): void {
    if (this.state.faceDetected !== (features !== null)) {
      this.setState({ faceDetected: features !== null })
    }
    if (!features) return

    const blinking = this.updateBlink(features.eyeOpenness)
    if (!blinking) this.collector?.(features)
    if (!this.model) return

    let gaze: GazePoint
    if (blinking && this.lastGaze) {
      gaze = { ...this.lastGaze, timestamp: features.timestamp, blinking: true }
    } else {
      const [rawX, rawY] = this.model.predict(features.vector)
      const screenX = this.filterX.filter(rawX, features.timestamp)
      const screenY = this.filterY.filter(rawY, features.timestamp)
      const [x, y] = screenToClient(screenX, screenY)
      gaze = { x, y, screenX, screenY, timestamp: features.timestamp, blinking }
    }
    this.lastGaze = gaze
    this.gazeListeners.forEach((l) => l(gaze))
  }

  private updateBlink(openness: number): boolean {
    if (this.openBaseline === null) {
      this.openBaseline = openness
      return false
    }
    const blinking = openness < this.openBaseline * BLINK_RATIO
    // Track the open-eye level slowly so lighting/pose drift doesn't cause false blinks.
    if (!blinking) this.openBaseline += 0.02 * (openness - this.openBaseline)
    return blinking
  }

  private setState(patch: Partial<TrackerState>): void {
    this.state = { ...this.state, ...patch }
    this.stateListeners.forEach((l) => l())
  }
}
