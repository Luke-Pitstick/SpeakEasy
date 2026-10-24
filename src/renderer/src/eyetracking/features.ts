import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { EyeFeatures } from './types'

// MediaPipe face mesh indices, ordered left-to-right as seen in the camera image so both
// eyes share the same axis direction.
const EYE_A = { start: 33, end: 133, upper: 159, lower: 145, iris: 468 }
const EYE_B = { start: 362, end: 263, upper: 386, lower: 374, iris: 473 }

type Eye = typeof EYE_A

interface EyeMeasurement {
  /** Iris offset along the eye axis, in eye widths. */
  h: number
  /** Iris offset perpendicular to the eye axis, in eye widths. */
  v: number
  openness: number
}

function measureEye(lm: NormalizedLandmark[], eye: Eye, aspect: number): EyeMeasurement {
  // Landmarks are normalised separately per axis; scale x so distances are isotropic.
  const px = (i: number): [number, number] => [lm[i].x * aspect, lm[i].y]
  const [sx, sy] = px(eye.start)
  const [ex, ey] = px(eye.end)
  const [ix, iy] = px(eye.iris)
  const [ux, uy] = px(eye.upper)
  const [lx, ly] = px(eye.lower)

  const width = Math.hypot(ex - sx, ey - sy) || 1e-6
  const ax = (ex - sx) / width
  const ay = (ey - sy) / width
  const dx = ix - (sx + ex) / 2
  const dy = iy - (sy + ey) / 2

  return {
    h: (dx * ax + dy * ay) / width,
    v: (-dx * ay + dy * ax) / width,
    openness: Math.hypot(lx - ux, ly - uy) / width
  }
}

/**
 * Builds the calibration feature vector from one face's landmarks.
 *
 * @param landmarks 478-point face mesh (with iris refinement) from MediaPipe.
 * @param matrix Column-major 4x4 facial transformation matrix, if available.
 * @param aspect Video width / height.
 */
export function extractFeatures(
  landmarks: NormalizedLandmark[],
  matrix: number[] | undefined,
  aspect: number,
  timestamp: number
): EyeFeatures {
  const a = measureEye(landmarks, EYE_A, aspect)
  const b = measureEye(landmarks, EYE_B, aspect)

  // Head pose: forward axis direction (x, y) and translation (x, y, z).
  const head = matrix ? [matrix[8], matrix[9], matrix[12], matrix[13], matrix[14]] : [0, 0, 0, 0, 0]

  return {
    vector: [a.h, a.v, b.h, b.v, ...head],
    eyeOpenness: (a.openness + b.openness) / 2,
    timestamp
  }
}
