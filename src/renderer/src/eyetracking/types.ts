/** One frame of eye/head measurements extracted from the webcam. */
export interface EyeFeatures {
  /** Feature vector fed to the calibration model (iris offsets + head pose). */
  vector: number[]
  /** Eyelid opening relative to eye width, averaged over both eyes. */
  eyeOpenness: number
  timestamp: number
}

/** Where the user is looking, in this window's CSS pixel space. */
export interface GazePoint {
  x: number
  y: number
  /** Same point in screen coordinates (survives window moves). */
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
  sampleCount: number
}
