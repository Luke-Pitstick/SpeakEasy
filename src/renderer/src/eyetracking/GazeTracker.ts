import { AimAssist, findGazeTargets, type AimAssistOptions, type GazeTargetRect } from './aimAssist'
import { DwellSelector, type DwellOptions, type DwellUpdate } from './dwell'
import { HeadPointer, type HeadPointerOptions } from './headPointer'
import { GazeModel, type GazeInput, type TrainingSample } from './gazeModel'
import { OneEuroFilter } from './oneEuroFilter'
import { areNeighbors, assessSelection } from './selectionLearning'
import { WebcamFaceSource } from './WebcamFaceSource'
import type { CalibrationResult, EyeFeatures, GazePoint, HeadPose, TrackerStatus } from './types'

// Bumped when the model's inputs change; older calibrations can't be reused.
const STORAGE_KEY = 'speakeasy.gazeCalibration.v6'
const SAMPLES_KEY = 'speakeasy.gazeSamples.v3'
/** Pointer mode and head-pointer sensitivity (the neutral pose is re-centred each session). */
const POINTER_KEY = 'speakeasy.pointer.v1'
/** Flag that makes head pointing available as an alternative to eye gaze. */
const HEAD_POINTER_FLAG = 'speakeasy.headPointer'
/** Eyes count as closed when openness drops below this fraction of the open-eye baseline. */
const BLINK_RATIO = 0.55
/**
 * Weight of the final calibration phase ("sit however is comfortable") in the head-movement
 * correction. That's the posture the app is actually used in, but it's a small share of the
 * samples; on real data, unweighted it left a ~60 px upward bias there, weighted 10× ~27 px.
 */
const NATURAL_POSTURE_WEIGHT = 10
/** How much eye history to keep for learning from clicks and selections. */
const RECENT_MS = 3000

// Click refinement: frames from this window around a click are taken as looking at the click
// point. The eyes land on a target before clicking and may leave right after.
const CLICK_WINDOW_BEFORE_MS = 350
const CLICK_WINDOW_AFTER_MS = 100
/** Clicks predicted further away than this were probably not being looked at. */
const MAX_CLICK_ERROR_PX = 300
/** Each click sample counts this many times as much as a calibration sample. */
const CLICK_WEIGHT = 30
/** Oldest corrections are dropped beyond this, so the model follows the current setup. */
const MAX_CORRECTIONS = 80
/** Drift tests kept for export. */
const MAX_DRIFT_TESTS = 5
/** Drift test offsets are averaged over its first and last this-many ms. */
const DRIFT_SUMMARY_WINDOW_MS = 5000

// Selection learning: the start of a dwell is the eyes arriving, so it's skipped; the
// selection is only learned from if, within the confirmation window, it isn't undone and the
// user doesn't select a neighbouring target instead (a sign the first one missed).
const DWELL_SETTLE_MS = 300
const SELECTION_CONFIRM_MS = 2000

export interface TrackerState {
  status: TrackerStatus
  error: string | null
  faceDetected: boolean
  calibrated: boolean
  aimAssist: AimAssistOptions
  dwell: DwellOptions
  /** Clicks and gaze selections currently contributing to the calibration. */
  learnedClicks: number
  learnedSelections: number
  /** False when calibration samples weren't saved (calibrated by an older version). */
  canRefine: boolean
  /** Head pointing is opt-in: set localStorage 'speakeasy.headPointer' to 'on'. */
  headPointerAvailable: boolean
  /** What moves the pointer: eye gaze (needs calibration) or head pointing. */
  pointerMode: PointerMode
  headPointer: HeadPointerOptions
  /** Head pointing needs a neutral pose (centring) once per session. */
  headCentered: boolean
}

export type PointerMode = 'eyes' | 'head'

export type CalibrationPhase = 'still' | 'motion' | 'validation' | 'drift'

export interface CalibrationSample {
  input: GazeInput
  /** Screen-space target the user was looking at. */
  target: [number, number]
  /** Which part of calibration recorded it (kept for exports and analysis). */
  phase?: CalibrationPhase
  /** When it was recorded (`performance.now()` ms), for analysing changes over time. */
  t?: number
  /** Raw landmark subset (see `EyeFeatures.raw`): exported, never persisted. */
  raw?: number[]
}

/** Gaze offset at the start and end of a drift test (mean predicted - true, px). */
export interface DriftSummary {
  start: [number, number]
  end: [number, number]
  durationS: number
}

/** Outcome of learning from a click or a gaze selection. */
export interface LearningResult {
  kind: 'click' | 'selection'
  accepted: boolean
  /** Where it happened, in window px (click point or selected target's centre). */
  x: number
  y: number
  /** Mean gaze error there before learning from it, px. */
  errorBefore: number | null
  /** Mean gaze error for the same frames after refitting, px. */
  errorAfter: number | null
  reason?: string
}

interface Correction {
  kind: LearningResult['kind']
  weight: number
  samples: CalibrationSample[]
}

interface PointerPrefs {
  mode: PointerMode
  sensitivity: number
}

interface StoredSamples {
  base: CalibrationSample[]
  corrections: Correction[]
  /** Drift tests: long stares at one dot, kept only for export and analysis, never fitted. */
  driftTests?: CalibrationSample[][]
}

interface PendingSelection {
  target: GazeTargetRect
  correction: Correction
  result: LearningResult
  timer: number
}

// Calibration is stored in screen coordinates so it stays valid when the window moves.
export function clientToScreen(x: number, y: number): [number, number] {
  return [x + window.screenX, y + window.screenY + (window.outerHeight - window.innerHeight)]
}

export function screenToClient(x: number, y: number): [number, number] {
  return [x - window.screenX, y - window.screenY - (window.outerHeight - window.innerHeight)]
}

function load<T>(key: string, parse: (data: unknown) => T | null): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? parse(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

/** JSON replacer: rounds numbers to 6 significant digits, optionally dropping raw landmarks. */
function compactJSON(dropRaw: boolean): (key: string, value: unknown) => unknown {
  return (key, v) =>
    dropRaw && key === 'raw' ? undefined : typeof v === 'number' ? Number(v.toPrecision(6)) : v
}

/** Reads a plain-string localStorage flag (not JSON), e.g. 'on'. */
function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function save(key: string, value: unknown): void {
  try {
    // 6 significant digits is far below landmark noise and keeps the sample store small. Raw
    // landmarks would overflow localStorage, so they live in memory for export only.
    localStorage.setItem(key, JSON.stringify(value, compactJSON(true)))
  } catch {
    // Still works for this session without persistence.
  }
}

function parseSamples(data: unknown): StoredSamples | null {
  const d = data as Partial<StoredSamples> & { clicks?: CalibrationSample[][] }
  if (!Array.isArray(d?.base)) return null
  // Earlier versions stored only click corrections.
  const corrections =
    d.corrections ??
    (d.clicks ?? []).map((samples) => ({ kind: 'click' as const, weight: CLICK_WEIGHT, samples }))
  return { base: d.base, corrections, driftTests: d.driftTests ?? [] }
}

/**
 * Fits the gaze model from calibration samples plus learned corrections. Still-head samples
 * anchor the eye mapping; head-movement samples, natural-posture (validation) samples and
 * corrections (at their weights) inform the head-movement correction.
 */
function fitModel({ base, corrections }: StoredSamples): GazeModel {
  const training: TrainingSample[] = [
    ...base.map((s) => ({
      input: s.input,
      target: s.target,
      anchor: s.phase === 'still',
      weight: s.phase === 'validation' ? NATURAL_POSTURE_WEIGHT : 1
    })),
    ...corrections.flatMap((c) =>
      c.samples.map((s) => ({ input: s.input, target: s.target, anchor: false, weight: c.weight }))
    )
  ]
  return GazeModel.fit(training)
}

function meanError(model: GazeModel, samples: CalibrationSample[]): number {
  const total = samples.reduce((sum, s) => {
    const [x, y] = model.predict(s.input)
    return sum + Math.hypot(x - s.target[0], y - s.target[1])
  }, 0)
  return total / samples.length
}

const toSample = (
  f: EyeFeatures,
  target: [number, number],
  phase?: CalibrationPhase
): CalibrationSample => ({
  input: { h: f.h, v: f.v, eyes: f.eyes, head: f.head },
  target,
  phase,
  t: f.timestamp,
  raw: f.raw
})

/**
 * Turns webcam eye features into a smoothed on-screen gaze point, and gaze into selections.
 *
 * Usage: `start()`, run a calibration (`collectSamples` per target, then `calibrate`),
 * then listen with `onGaze` / `onSelect`.
 */
export class GazeTracker {
  private readonly source = new WebcamFaceSource((f) => this.handleFeatures(f))
  private samples: StoredSamples | null = load(SAMPLES_KEY, parseSamples)
  // Saved samples outlive model changes: if the saved model is from an older version, rebuild
  // it from them rather than making the user recalibrate.
  private model: GazeModel | null =
    load(STORAGE_KEY, GazeModel.fromJSON) ??
    (this.samples && this.samples.base.length >= 20 ? fitModel(this.samples) : null)
  /** Recent open-eye frames, for learning from clicks and selections. */
  private recent: EyeFeatures[] = []
  private readonly filterX = new OneEuroFilter()
  private readonly filterY = new OneEuroFilter()
  private readonly aimAssist = new AimAssist()
  private readonly dwell = new DwellSelector()
  private readonly headPointerAvailable = readFlag(HEAD_POINTER_FLAG) === 'on'
  private readonly pointerPrefs = load(POINTER_KEY, (d) => d as Partial<PointerPrefs>) ?? {}
  private readonly headPointer = new HeadPointer({
    sensitivity: this.pointerPrefs.sensitivity ?? 1
  })
  private targets: GazeTargetRect[] = []
  private pending: PendingSelection | null = null
  private openBaseline: number | null = null
  private collector: ((f: EyeFeatures) => void) | null = null
  private lastGaze: GazePoint | null = null
  private readonly gazeListeners = new Set<(gaze: GazePoint) => void>()
  private readonly headListeners = new Set<(head: HeadPose) => void>()
  private readonly dwellListeners = new Set<(dwell: DwellUpdate) => void>()
  private readonly selectListeners = new Set<(id: string) => void>()
  private readonly learnListeners = new Set<(result: LearningResult) => void>()
  private readonly stateListeners = new Set<() => void>()
  private state: TrackerState = {
    status: 'idle',
    error: null,
    faceDetected: false,
    calibrated: this.model !== null,
    aimAssist: this.aimAssist.options,
    dwell: this.dwell.options,
    ...this.learnedCounts(),
    canRefine: this.samples !== null,
    headPointerAvailable: this.headPointerAvailable,
    pointerMode: this.headPointerAvailable ? (this.pointerPrefs.mode ?? 'eyes') : 'eyes',
    headPointer: this.headPointer.options,
    headCentered: false
  }

  /** The live camera stream while running, for previews. */
  get mediaStream(): MediaStream | null {
    return this.source.mediaStream
  }

  get latestGaze(): GazePoint | null {
    return this.lastGaze
  }

  /** Average eye position (camera space, cm) during the current calibration. */
  get calibrationReference(): [number, number, number] | null {
    return this.model?.reference ?? null
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

  /** Subscribe to head pose updates, emitted once per camera frame while a face is visible. */
  onHead(listener: (head: HeadPose) => void): () => void {
    this.headListeners.add(listener)
    return () => this.headListeners.delete(listener)
  }

  /** Subscribe to dwell progress, emitted once per gaze update. */
  onDwell(listener: (dwell: DwellUpdate) => void): () => void {
    this.dwellListeners.add(listener)
    return () => this.dwellListeners.delete(listener)
  }

  /**
   * Subscribe to gaze selections. The selected element also receives a bubbling `gazeselect`
   * event and, unless it has `data-gaze-click="false"`, a `click()`.
   */
  onSelect(listener: (id: string) => void): () => void {
    this.selectListeners.add(listener)
    return () => this.selectListeners.delete(listener)
  }

  /** Subscribe to the outcome of learning from clicks and selections. */
  onLearn(listener: (result: LearningResult) => void): () => void {
    this.learnListeners.add(listener)
    return () => this.learnListeners.delete(listener)
  }

  /** Changes how strongly gaze is pulled toward `data-gaze-target` elements. */
  setAimAssist(options: Partial<AimAssistOptions>): void {
    this.aimAssist.options = { ...this.aimAssist.options, ...options }
    this.aimAssist.reset()
    this.setState({ aimAssist: this.aimAssist.options })
  }

  /** Changes dwell selection (on/off, duration, learning from selections). */
  /** Switches between eye gaze and head pointing (head only when the flag is on). */
  setPointerMode(mode: PointerMode): void {
    if (mode === 'head' && !this.headPointerAvailable) return
    if (mode === this.state.pointerMode) return
    this.filterX.reset()
    this.filterY.reset()
    this.aimAssist.reset()
    this.dwell.reset()
    this.setState({ pointerMode: mode })
    this.savePointerPrefs()
  }

  /** Changes head-pointer sensitivity. */
  setHeadPointer(options: Partial<HeadPointerOptions>): void {
    this.headPointer.options = { ...this.headPointer.options, ...options }
    this.setState({ headPointer: this.headPointer.options })
    this.savePointerPrefs()
  }

  /**
   * Sets the head pointer's neutral pose from the head poses of the last `ms` milliseconds,
   * during which the user should have been pointing their face at the screen centre.
   */
  centerHeadPointer(ms = 600): void {
    const now = this.recent.at(-1)?.timestamp ?? 0
    this.headPointer.center(this.framesBetween(now - ms, now).map((f) => f.head))
    this.filterX.reset()
    this.filterY.reset()
    this.setState({ headCentered: this.headPointer.neutral !== null })
  }

  private savePointerPrefs(): void {
    const prefs: PointerPrefs = {
      mode: this.state.pointerMode,
      sensitivity: this.headPointer.options.sensitivity
    }
    save(POINTER_KEY, prefs)
  }

  setDwell(options: Partial<DwellOptions>): void {
    this.dwell.options = { ...this.dwell.options, ...options }
    this.dwell.reset()
    this.setState({ dwell: this.dwell.options })
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
   * @param phase Calibration phase, stored with each sample.
   */
  collectSamples(
    clientX: number,
    clientY: number,
    durationMs: number,
    phase?: CalibrationPhase
  ): Promise<CalibrationSample[]> {
    const target = clientToScreen(clientX, clientY)
    const samples: CalibrationSample[] = []
    const collector = (f: EyeFeatures): void => {
      samples.push(toSample(f, target, phase))
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
    this.discardPending()
    this.samples = { base: samples, corrections: [], driftTests: [] }
    this.model = fitModel(this.samples)
    save(STORAGE_KEY, this.model.toJSON())
    save(SAMPLES_KEY, this.samples)
    this.filterX.reset()
    this.filterY.reset()
    this.setState({ calibrated: true, canRefine: true, ...this.learnedCounts() })
  }

  /**
   * Improves calibration from a click: the user is assumed to have been looking at the point
   * they clicked, so the frames around the click become extra calibration samples. Clicks the
   * model places far from where the user clicked are ignored (probably not looking there).
   *
   * @param clientX Click x in window CSS pixels.
   * @param clientY Click y in window CSS pixels.
   * @param clickTime `performance.now()` at the click.
   */
  async refineFromClick(
    clientX: number,
    clientY: number,
    clickTime = performance.now()
  ): Promise<LearningResult> {
    const result = (fields: Partial<LearningResult>): LearningResult => {
      const r: LearningResult = {
        kind: 'click',
        accepted: false,
        x: clientX,
        y: clientY,
        errorBefore: null,
        errorAfter: null,
        ...fields
      }
      this.learnListeners.forEach((l) => l(r))
      return r
    }
    if (!this.model) return result({ reason: 'Not calibrated' })
    if (!this.samples) return result({ reason: 'Recalibrate once to enable learning' })

    await new Promise((r) => setTimeout(r, CLICK_WINDOW_AFTER_MS))
    const target = clientToScreen(clientX, clientY)
    const samples = this.framesBetween(
      clickTime - CLICK_WINDOW_BEFORE_MS,
      clickTime + CLICK_WINDOW_AFTER_MS
    ).map((f) => toSample(f, target))
    if (samples.length < 3) return result({ reason: 'No eye data around the click' })

    const errorBefore = meanError(this.model, samples)
    if (errorBefore > MAX_CLICK_ERROR_PX) {
      return result({ reason: 'Too far from your gaze; were you looking there?', errorBefore })
    }
    this.addCorrection({ kind: 'click', weight: CLICK_WEIGHT, samples })
    return result({ accepted: true, errorBefore, errorAfter: meanError(this.model, samples) })
  }

  /**
   * Cancels learning from the most recent gaze selection, if it hasn't been applied yet.
   * Call this when the user undoes a selection: it was probably the wrong target.
   *
   * @returns Whether there was pending learning to cancel.
   */
  cancelPendingLearning(): boolean {
    if (!this.pending) return false
    const { result } = this.pending
    this.discardPending()
    const undone = { ...result, accepted: false, errorAfter: null, reason: 'Undone, not learned' }
    this.learnListeners.forEach((l) => l(undone))
    return true
  }

  /**
   * Stores a drift test (the user staring at one dot for a while) for export, and summarises
   * how the gaze offset moved between its first and last few seconds. Doesn't change the model.
   */
  saveDriftTest(samples: CalibrationSample[]): DriftSummary {
    const model = this.model
    if (!model || !this.samples) throw new Error('Calibrate first')
    if (samples.length < 30) throw new Error('Not enough eye data — is your face visible?')
    this.samples.driftTests = [...(this.samples.driftTests ?? []), samples].slice(-MAX_DRIFT_TESTS)
    save(SAMPLES_KEY, this.samples)
    const t0 = samples[0].t ?? 0
    const t1 = samples[samples.length - 1].t ?? 0
    const offset = (part: CalibrationSample[]): [number, number] =>
      [0, 1].map(
        (k) =>
          part.reduce((sum, s) => sum + model.predict(s.input)[k] - s.target[k], 0) / part.length
      ) as [number, number]
    const span = DRIFT_SUMMARY_WINDOW_MS
    return {
      start: offset(samples.filter((s) => (s.t ?? 0) - t0 <= span)),
      end: offset(samples.filter((s) => t1 - (s.t ?? 0) <= span)),
      durationS: (t1 - t0) / 1000
    }
  }

  /** Drops everything learned since calibrating (clicks and selections). */
  clearLearned(): void {
    if (!this.samples) return
    this.discardPending()
    this.samples.corrections = []
    this.refit()
  }

  /**
   * Everything needed to re-fit and compare gaze models offline: the calibration samples
   * (tagged by phase), learned corrections, the current model, and the screen geometry.
   * Contains face pose and eye measurements only, no images.
   */
  exportCalibration(): string | null {
    if (!this.samples || !this.model) return null
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          devicePixelRatio: window.devicePixelRatio
        },
        window: {
          screenX: window.screenX,
          screenY: window.screenY,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
          outerHeight: window.outerHeight
        },
        model: this.model.toJSON(),
        samples: this.samples
      },
      compactJSON(false)
    )
  }

  /** Measures accuracy of the current model on samples it was not trained on. */
  evaluate(samples: CalibrationSample[]): CalibrationResult {
    const model = this.model
    if (!model || samples.length === 0) {
      return { meanErrorPx: NaN, verticalBiasPx: NaN, bottomErrorPx: NaN, sampleCount: 0 }
    }
    const bottom = samples.filter(
      (s) => screenToClient(...s.target)[1] > (window.innerHeight * 2) / 3
    )
    const bias =
      samples.reduce((sum, s) => sum + model.predict(s.input)[1] - s.target[1], 0) / samples.length
    return {
      meanErrorPx: meanError(model, samples),
      verticalBiasPx: bias,
      bottomErrorPx: bottom.length ? meanError(model, bottom) : NaN,
      sampleCount: samples.length
    }
  }

  clearCalibration(): void {
    this.discardPending()
    this.model = null
    this.samples = null
    this.lastGaze = null
    try {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem(SAMPLES_KEY)
    } catch {
      // Nothing persisted.
    }
    this.setState({
      calibrated: false,
      canRefine: false,
      learnedClicks: 0,
      learnedSelections: 0
    })
  }

  private handleFeatures(features: EyeFeatures | null): void {
    if (this.state.faceDetected !== (features !== null)) {
      this.setState({ faceDetected: features !== null })
    }
    if (!features) return
    this.headListeners.forEach((l) => l(features.head))

    const blinking = this.updateBlink(features.eyeOpenness)
    if (!blinking) {
      this.collector?.(features)
      this.recent.push(features)
      const cutoff = features.timestamp - RECENT_MS
      while (this.recent[0].timestamp < cutoff) this.recent.shift()
    }
    // Where the pointer is this frame, in screen px, before smoothing.
    let point: [number, number] | null
    if (this.state.pointerMode === 'head') {
      const p = this.headPointer.point(features.head, window.innerWidth, window.innerHeight)
      point = p && clientToScreen(...p)
    } else {
      // A closed eye has no gaze; hold the last position (below).
      point = this.model && !blinking ? this.model.predict(features) : null
    }
    // Head pose doesn't depend on the eyes, so blinks don't pause head pointing.
    const eyesClosed = blinking && this.state.pointerMode === 'eyes'

    let gaze: GazePoint
    if (!point) {
      if (!eyesClosed || !this.lastGaze) return
      gaze = { ...this.lastGaze, timestamp: features.timestamp, blinking: true }
    } else {
      const screenX = this.filterX.filter(point[0], features.timestamp)
      const screenY = this.filterY.filter(point[1], features.timestamp)
      const [rawX, rawY] = screenToClient(screenX, screenY)
      this.targets = findGazeTargets()
      const { x, y, target } = this.aimAssist.apply(rawX, rawY, this.targets)
      gaze = {
        x,
        y,
        rawX,
        rawY,
        target,
        screenX,
        screenY,
        timestamp: features.timestamp,
        blinking: eyesClosed
      }
    }
    this.lastGaze = gaze
    this.gazeListeners.forEach((l) => l(gaze))

    const dwell = this.dwell.update(gaze)
    this.dwellListeners.forEach((l) => l(dwell))
    if (dwell.selected) this.select(dwell.selected, features.timestamp)
  }

  private select(id: string, time: number): void {
    const target = this.targets.find((t) => t.id === id)
    this.selectListeners.forEach((l) => l(id))
    if (target?.element) {
      target.element.dispatchEvent(new CustomEvent('gazeselect', { bubbles: true, detail: { id } }))
      if (target.element.dataset.gazeClick !== 'false') target.element.click()
    }
    // Selections only teach the eye model; head pointing has nothing to calibrate.
    if (target && this.dwell.options.learn && this.state.pointerMode === 'eyes') {
      this.learnFromSelection(target, time)
    }
  }

  /** Queues a gaze selection as calibration evidence, if it passes the safeguards. */
  private learnFromSelection(selected: GazeTargetRect, time: number): void {
    if (!this.model || !this.samples) return
    if (this.pending && areNeighbors(this.pending.target, selected)) {
      const { result } = this.pending
      this.discardPending()
      const corrected = {
        ...result,
        accepted: false,
        reason: 'Followed by a neighbour, not learned'
      }
      this.learnListeners.forEach((l) => l(corrected))
    } else {
      // A previous selection not undone or corrected in time is confirmed.
      this.commitPending()
    }
    const frames = this.framesBetween(time - this.dwell.options.durationMs + DWELL_SETTLE_MS, time)
    const model = this.model
    const rawGaze = frames.map((f) => screenToClient(...model.predict(f)))
    const others = this.targets.filter((t) => t.id !== selected.id)
    const assessment = assessSelection(rawGaze, selected, others)
    const base = {
      kind: 'selection' as const,
      x: (selected.left + selected.right) / 2,
      y: (selected.top + selected.bottom) / 2,
      errorBefore: assessment.error,
      errorAfter: null
    }
    if (!assessment.ok) {
      const rejected: LearningResult = { ...base, accepted: false, reason: assessment.reason }
      this.learnListeners.forEach((l) => l(rejected))
      return
    }

    const focus = clientToScreen(...assessment.focus)
    const correction: Correction = {
      kind: 'selection',
      weight: assessment.weight,
      samples: frames.map((f) => toSample(f, focus))
    }
    const timer = window.setTimeout(() => this.commitPending(), SELECTION_CONFIRM_MS)
    this.pending = { target: selected, correction, result: { ...base, accepted: true }, timer }
  }

  private commitPending(): void {
    if (!this.pending || !this.model) return
    const { correction, result } = this.pending
    this.discardPending()
    this.addCorrection(correction)
    const learned = { ...result, errorAfter: meanError(this.model, correction.samples) }
    this.learnListeners.forEach((l) => l(learned))
  }

  private discardPending(): void {
    if (this.pending) clearTimeout(this.pending.timer)
    this.pending = null
  }

  private framesBetween(from: number, to: number): EyeFeatures[] {
    return this.recent.filter((f) => f.timestamp >= from && f.timestamp <= to)
  }

  private addCorrection(correction: Correction): void {
    if (!this.samples) return
    this.samples.corrections.push(correction)
    if (this.samples.corrections.length > MAX_CORRECTIONS) this.samples.corrections.shift()
    this.refit()
  }

  private refit(): void {
    if (!this.model || !this.samples) return
    this.model = fitModel(this.samples)
    save(STORAGE_KEY, this.model.toJSON())
    save(SAMPLES_KEY, this.samples)
    this.setState(this.learnedCounts())
  }

  private learnedCounts(): Pick<TrackerState, 'learnedClicks' | 'learnedSelections'> {
    const corrections = this.samples?.corrections ?? []
    return {
      learnedClicks: corrections.filter((c) => c.kind === 'click').length,
      learnedSelections: corrections.filter((c) => c.kind === 'selection').length
    }
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

// The app keeps one long-lived tracker instance, so hot-swapping this module (or anything it
// imports) in dev would leave that instance running the old code, e.g. without newly added
// methods. Reload the page instead.
import.meta.hot?.accept(() => location.reload())
