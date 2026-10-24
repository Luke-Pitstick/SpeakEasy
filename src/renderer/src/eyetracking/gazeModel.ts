/**
 * Maps eye feature vectors to screen coordinates with ridge regression.
 *
 * Features are standardised, then expanded with quadratic terms of the averaged iris offsets
 * (gaze is not linear in iris position near the screen edges). Head-pose features stay linear
 * so a 9-point calibration does not overfit.
 */
export interface GazeModelData {
  mean: number[]
  std: number[]
  wx: number[]
  wy: number[]
}

function expand(z: number[]): number[] {
  const h = (z[0] + z[2]) / 2
  const v = (z[1] + z[3]) / 2
  return [1, ...z, h * h, v * v, h * v]
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

export class GazeModel {
  private constructor(private readonly data: GazeModelData) {}

  /**
   * Fits a model to calibration samples.
   *
   * @param features One feature vector per sample.
   * @param targets Screen position the user was looking at for each sample.
   * @param lambda Ridge penalty (in standardised feature space); the intercept is not penalised.
   */
  static fit(features: number[][], targets: [number, number][], lambda = 3): GazeModel {
    const dim = features[0].length
    const mean = new Array(dim).fill(0)
    const std = new Array(dim).fill(0)
    for (const f of features) f.forEach((v, i) => (mean[i] += v / features.length))
    for (const f of features) f.forEach((v, i) => (std[i] += (v - mean[i]) ** 2 / features.length))
    for (let i = 0; i < dim; i++) std[i] = Math.sqrt(std[i]) || 1

    const X = features.map((f) => expand(f.map((v, i) => (v - mean[i]) / std[i])))
    const p = X[0].length
    const XtX = Array.from({ length: p }, () => new Array(p).fill(0))
    const Xty = new Array(p).fill(0)
    const Xtx = new Array(p).fill(0)
    X.forEach((row, n) => {
      for (let i = 0; i < p; i++) {
        Xtx[i] += row[i] * targets[n][0]
        Xty[i] += row[i] * targets[n][1]
        for (let j = 0; j < p; j++) XtX[i][j] += row[i] * row[j]
      }
    })
    for (let i = 1; i < p; i++) XtX[i][i] += lambda

    const wx = solve(
      XtX.map((r) => [...r]),
      Xtx
    )
    const wy = solve(XtX, Xty)
    return new GazeModel({ mean, std, wx, wy })
  }

  static fromJSON(data: GazeModelData): GazeModel {
    return new GazeModel(data)
  }

  toJSON(): GazeModelData {
    return this.data
  }

  predict(feature: number[]): [number, number] {
    const { mean, std, wx, wy } = this.data
    const row = expand(feature.map((v, i) => (v - mean[i]) / std[i]))
    let x = 0
    let y = 0
    for (let i = 0; i < row.length; i++) {
      x += row[i] * wx[i]
      y += row[i] * wy[i]
    }
    return [x, y]
  }
}
