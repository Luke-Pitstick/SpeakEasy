/** Head pose in MediaPipe's metric camera space (cm, +x right, +y up, camera looks down -z). */
export interface HeadPose {
  /** 3x3 head-to-camera rotation, row-major. */
  rotation: number[]
  /** Point between the eyeballs, in camera space (cm). */
  eye: [number, number, number]
}

/** One frame of eye/head measurements extracted from the webcam. */
export interface EyeFeatures {
  /** Iris offset along the eye axis (eye widths, + = toward image right), both eyes averaged. */
  h: number
  /** Iris offset across the eye axis (eye widths, + = down in the image), both eyes averaged. */
  v: number
  /**
   * Per-eye detail, left-to-right in the image: [hA, vA, openA, hB, vB, openB]. Eyelid
   * opening is a strong vertical cue: the lids close in when looking down, just as the iris
   * landmark stops moving because the lid covers it.
   */
  eyes: number[]
  head: HeadPose
  /** Eyelid opening relative to eye width, averaged over both eyes. */
  eyeOpenness: number
  timestamp: number
  /**
   * Diagnostic subset of raw landmarks: [video aspect, x, y, z, x, y, z, ...] in MediaPipe's
   * normalised coordinates, for the indices in `RAW_LANDMARKS`. Exported for offline analysis
   * (e.g. computing head pose from rigid face points only); never persisted.
   */
  raw?: number[]
}

/** Where the user is looking, in this window's CSS pixel space. */
export interface GazePoint {
  /** Gaze after aim assist has pulled it toward the target being looked at. */
  x: number
  y: number
  /** Gaze straight from the model (smoothed, no aim assist). */
  rawX: number
  rawY: number
  /** `data-gaze-target` id of the element being looked at, or null. */
  target: string | null
  /** The raw point in screen coordinates (survives window moves). */
  screenX: number
  screenY: number
  timestamp: number
  /** True while the eyes are closed; x/y hold the last open-eye position. */
  blinking: boolean
}

export type TrackerStatus = 'idle' | 'loading' | 'running' | 'error'

export interface CalibrationResult {
  /** Mean distance between predicted and true target positions, in px. */
  meanErrorPx: number
  /** Mean (predicted - true) y, px: negative means gaze reads too high. */
  verticalBiasPx: number
  /** Mean error for targets in the bottom third of the window, px (NaN if none). */
  bottomErrorPx: number
  sampleCount: number
}
