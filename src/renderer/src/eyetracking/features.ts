import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { EyeFeatures, HeadPose } from './types'

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

type ImagePoint = Pick<NormalizedLandmark, 'x' | 'y'>

function measureEye(
  lm: NormalizedLandmark[],
  eye: Eye,
  aspect: number,
  iris: ImagePoint | null
): EyeMeasurement {
  // Landmarks are normalised separately per axis; scale x so distances are isotropic.
  const px = (i: number): [number, number] => [lm[i].x * aspect, lm[i].y]
  const [sx, sy] = px(eye.start)
  const [ex, ey] = px(eye.end)
  const [ix, iy] = iris ? [iris.x * aspect, iris.y] : px(eye.iris)
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
 * Landmarks recorded for diagnostics: points that stay rigid with the skull (forehead, nose
 * bridge, cheekbones, temples), then both eyelid outlines and irises. MediaPipe's own head pose
 * also uses the eyes, brows and mouth, so it shifts as the eyes move; these allow testing a
 * head pose from rigid points only.
 */
export const RAW_LANDMARKS = [
  // Rigid face points.
  10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 234, 454, 93, 323, 127, 356, 162, 389, 21, 251, 54, 284,
  103, 332,
  // Eyelid outlines (A then B, as in irisRefine.ts) and irises (centre + 4 edge points each).
  33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7, 362, 398, 384, 385,
  386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382, 468, 469, 470, 471, 472, 473, 474,
  475, 476, 477
]

// Midpoint between the eyeball centres in MediaPipe's canonical face model (cm): the eye
// corners' midpoint (y 2.62, z 3.47) moved back ~1.2 cm to the centre of rotation.
const CANONICAL_EYE_CENTER = [0, 2.62, 2.3]

/**
 * Converts MediaPipe's 4x4 facial transformation matrix into a head pose.
 *
 * @param m Flattened 4x4 matrix (column-major per MediaPipe's MatrixData default; row-major
 *   input is detected and handled).
 */
function headPoseFromMatrix(m: number[]): HeadPose {
  const rowMajor =
    Math.abs(m[3]) + Math.abs(m[7]) + Math.abs(m[11]) >
    Math.abs(m[12]) + Math.abs(m[13]) + Math.abs(m[14])
  const at = (r: number, c: number): number => (rowMajor ? m[r * 4 + c] : m[c * 4 + r])
  const rotation = [0, 1, 2].flatMap((r) => [at(r, 0), at(r, 1), at(r, 2)])
  const [cx, cy, cz] = CANONICAL_EYE_CENTER
  const eye = [0, 1, 2].map(
    (r) => rotation[r * 3] * cx + rotation[r * 3 + 1] * cy + rotation[r * 3 + 2] * cz + at(r, 3)
  ) as [number, number, number]
  return { rotation, eye }
}

/**
 * Builds eye features from one face's landmarks.
 *
 * @param landmarks 478-point face mesh (with iris refinement) from MediaPipe.
 * @param matrix Flattened 4x4 facial transformation matrix.
 * @param aspect Video width / height.
 * @param iris Refined iris centres for eyes A and B (normalised image coordinates); a null
 *   entry falls back to MediaPipe's iris landmark.
 */
export function extractFeatures(
  landmarks: NormalizedLandmark[],
  matrix: number[],
  aspect: number,
  timestamp: number,
  iris: (ImagePoint | null)[] = [null, null]
): EyeFeatures {
  const a = measureEye(landmarks, EYE_A, aspect, iris[0])
  const b = measureEye(landmarks, EYE_B, aspect, iris[1])
  return {
    h: (a.h + b.h) / 2,
    v: (a.v + b.v) / 2,
    eyes: [a.h, a.v, a.openness, b.h, b.v, b.openness],
    head: headPoseFromMatrix(matrix),
    eyeOpenness: (a.openness + b.openness) / 2,
    timestamp,
    raw: [aspect, ...RAW_LANDMARKS.flatMap((i) => [landmarks[i].x, landmarks[i].y, landmarks[i].z])]
  }
}
