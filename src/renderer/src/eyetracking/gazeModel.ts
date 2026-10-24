import type { EyeFeatures } from './types'

/**
 * Two-stage gaze model, chosen by benchmarking candidates on real calibration data.
 *
 * Stage 1 maps eye measurements (each eye's iris offset and eyelid opening, plus curvature
 * terms) to the screen using only samples recorded with the head still. Those are the most
 * precise samples, and the eyelids carry most of the vertical signal when looking down, where
 * the lid hides the iris's movement.
 *
 * Stage 2 is a correction for head movement, learned from every sample: a function of how
 * far the head pose is from the still-calibration pose (and how that interacts with the eye
 * measurements), with no constant term, so it is exactly zero at the calibration pose and
 * cannot disturb still-head precision.
 *
 * Why not geometry (eye ray rotated by head pose and cast onto the screen)? MediaPipe's head
 * pose shifts by 1–2° as the eyes and lids move even when the head is still, and a geometric
 * model trusts that fully, costing ~35–60 px per degree. On real data it was roughly twice as
 * inaccurate for still-head gaze. Here small head-pose wobbles barely register.
 */

export type GazeInput = Pick<EyeFeatures, 'h' | 'v' | 'eyes' | 'head'>

export interface TrainingSample {
  input: GazeInput
  /** Screen position being looked at. */
  target: [number, number]
  /** Recorded with the head still at the calibration pose: used for stage 1. */
  anchor: boolean
  /** Relative importance in the head-movement correction (default 1). */
  weight?: number
}

interface Linear {
  mean: number[]
  scale: number[]
  wx: number[]
  wy: number[]
}

export interface GazeModelData {
  version: 4
  eye: Linear
  head: Linear
  /** Head features at the calibration pose; stage 2 works on differences from this. */
  headReference: number[]
  /** Average eye position during calibration (camera space, cm), for positioning guidance. */
  reference: [number, number, number]
}

const EYE_LAMBDA = 10
const HEAD_LAMBDA = 100

/** Each eye's iris offset and lid opening, plus curvature for the screen edges. */
function eyeFeatures(s: GazeInput): number[] {
  const open = (s.eyes[2] + s.eyes[5]) / 2
  return [...s.eyes, s.h * s.h, s.v * s.v, s.h * s.v, s.v * open, open * open]
}

/** Face direction (x, y components) and eye position. */
function headFeatures(s: GazeInput): number[] {
  const R = s.head.rotation
  return [R[2], R[5], ...s.head.eye]
}

/** Head-pose change from calibration, alone and interacting with where the eyes point. */
function headCorrectionFeatures(s: GazeInput, reference: number[]): number[] {
  const delta = headFeatures(s).map((v, i) => v - reference[i])
  const open = (s.eyes[2] + s.eyes[5]) / 2
  return [...delta, ...delta.flatMap((d) => [d * s.h, d * s.v, d * open])]
}

/** Solves A x = b in place with Gaussian elimination and partial pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    }
    ;[A[col], A[pivot]] = [A[pivot], A[col]]
    ;[b[col], b[pivot]] = [b[pivot], b[col]]
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col]
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c]
      b[r] -= f * b[col]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r]
    for (let c = r + 1; c < n; c++) sum -= A[r][c] * x[c]
    x[r] = sum / A[r][r]
  }
  return x
}

function design(row: number[], mean: number[], scale: number[], intercept: boolean): number[] {
  const z = row.map((v, i) => (v - mean[i]) / scale[i])
  return intercept ? [1, ...z] : z
}

/**
 * Weighted ridge regression for two outputs on standardised features.
 *
 * @param intercept With an intercept, features are centred; without, they are only scaled, so
 *   an all-zero feature row predicts exactly zero.
 */
function fitLinear(
  rows: number[][],
  targets: [number, number][],
  weights: number[],
  lambda: number,
  intercept: boolean
): Linear {
  const d = rows[0].length
  const total = weights.reduce((a, b) => a + b, 0)
  const mean = new Array(d).fill(0)
  const scale = new Array(d).fill(0)
  if (intercept) rows.forEach((r, n) => r.forEach((v, i) => (mean[i] += (weights[n] * v) / total)))
  rows.forEach((r, n) =>
    r.forEach((v, i) => (scale[i] += (weights[n] * (v - mean[i]) ** 2) / total))
  )
  for (let i = 0; i < d; i++) scale[i] = Math.sqrt(scale[i]) || 1

  const X = rows.map((r) => design(r, mean, scale, intercept))
  const p = X[0].length
  const XtX = Array.from({ length: p }, () => new Array(p).fill(0))
  const Xtx = new Array(p).fill(0)
  const Xty = new Array(p).fill(0)
  X.forEach((row, n) => {
    const w = weights[n]
    for (let i = 0; i < p; i++) {
      Xtx[i] += w * row[i] * targets[n][0]
      Xty[i] += w * row[i] * targets[n][1]
      for (let j = 0; j < p; j++) XtX[i][j] += w * row[i] * row[j]
    }
  })
  for (let i = intercept ? 1 : 0; i < p; i++) XtX[i][i] += lambda
  const wx = solve(
    XtX.map((r) => [...r]),
    Xtx
  )
  const wy = solve(XtX, Xty)
  return { mean, scale, wx, wy }
}

function applyLinear(m: Linear, row: number[], intercept: boolean): [number, number] {
  const z = design(row, m.mean, m.scale, intercept)
  let x = 0
  let y = 0
  for (let i = 0; i < z.length; i++) {
    x += z[i] * m.wx[i]
    y += z[i] * m.wy[i]
  }
  return [x, y]
}

const average = (rows: number[][]): number[] =>
  rows[0].map((_, i) => rows.reduce((sum, r) => sum + r[i], 0) / rows.length)

export class GazeModel {
  private constructor(private readonly data: GazeModelData) {}

  /**
   * Fits both stages (closed form, a few ms).
   *
   * @param samples Calibration samples; `anchor` ones (head still) train the eye mapping and
   *   define the calibration pose. If there are too few, all samples are used.
   */
  static fit(samples: TrainingSample[]): GazeModel {
    const anchored = samples.filter((s) => s.anchor)
    const anchors = anchored.length >= 20 ? anchored : samples

    const eye = fitLinear(
      anchors.map((s) => eyeFeatures(s.input)),
      anchors.map((s) => s.target),
      anchors.map(() => 1),
      EYE_LAMBDA,
      true
    )
    const headReference = average(anchors.map((s) => headFeatures(s.input)))
    const head = fitLinear(
      samples.map((s) => headCorrectionFeatures(s.input, headReference)),
      samples.map((s) => {
        const [x, y] = applyLinear(eye, eyeFeatures(s.input), true)
        return [s.target[0] - x, s.target[1] - y]
      }),
      samples.map((s) => s.weight ?? 1),
      HEAD_LAMBDA,
      false
    )
    const reference = average(anchors.map((s) => s.input.head.eye)) as [number, number, number]
    return new GazeModel({ version: 4, eye, head, headReference, reference })
  }

  /** Restores a saved model, or returns null if it is from an older, incompatible version. */
  static fromJSON(data: unknown): GazeModel | null {
    return (data as GazeModelData)?.version === 4 ? new GazeModel(data as GazeModelData) : null
  }

  toJSON(): GazeModelData {
    return this.data
  }

  /** Average eye position during calibration (camera space, cm). */
  get reference(): [number, number, number] {
    return this.data.reference
  }

  predict(s: GazeInput): [number, number] {
    const { eye, head, headReference } = this.data
    const [x, y] = applyLinear(eye, eyeFeatures(s), true)
    const [dx, dy] = applyLinear(head, headCorrectionFeatures(s, headReference), false)
    return [x + dx, y + dy]
  }
}
