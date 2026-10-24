import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Sub-pixel iris centres from the full-resolution camera frame.
 *
 * MediaPipe finds landmarks on a 256 px crop of the face, so each iris is only ~10 px across
 * when it is located and the landmark jitters by a large fraction of the eye's travel. Here
 * the MediaPipe iris is only a starting guess: rays cast outward from it find the iris/sclera
 * edge (the limbus) in the camera's own pixels, and a circle fitted to those edge points gives
 * the refined centre. Only the sides of the iris are used, because the eyelids usually cover
 * its top and bottom.
 */

export type Point = [number, number]

/** A greyscale image, row-major, values 0..255. */
export interface GrayImage {
  data: Float32Array
  width: number
  height: number
}

export interface IrisGuess {
  center: Point
  radius: number
}

// Mesh indices: iris centre, its 4 edge points, and the eyelid outline (closed polygon).
// Eye A/B are left/right in the camera image, matching features.ts.
export const IRIS_EYES = [
  {
    center: 468,
    edges: [469, 470, 471, 472],
    outline: [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7]
  },
  {
    center: 473,
    edges: [474, 475, 476, 477],
    outline: [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382]
  }
]

/** Below this iris radius (px) there is too little detail to beat MediaPipe. */
const MIN_RADIUS_PX = 4
// Rays fan out ±56° around horizontal on each side of the iris.
const RAYS_PER_SIDE = 17
const RAY_SPREAD = (56 * Math.PI) / 180
// The limbus is searched for between these multiples of the guessed radius: far enough out to
// skip the pupil edge, far enough in to stay off the eye corners.
const SEARCH_MIN = 0.55
const SEARCH_MAX = 1.6
const STEP_PX = 0.25
/** Weakest iris→sclera brightness step accepted as an edge, grey levels per px. */
const MIN_EDGE = 3
/** Edge points closer than this to the eyelid outline are probably the lid, not the iris. */
const LID_MARGIN_PX = 1.5
const MIN_POINTS = 6
// Uncertainties (1 sigma) used to weigh the edge fit against MediaPipe, per axis. MediaPipe
// works on a fixed-size face crop, so its error in camera px grows with the iris's size.
const GUESS_SIGMA = 0.12
const RADIUS_SIGMA = 0.1
const EDGE_SIGMA_MIN_PX = 0.35
/** Largest believable correction to MediaPipe, as a fraction of the iris radius. */
const MAX_SHIFT = 0.5
const MAX_RADIUS_CHANGE = 0.3

/** Bilinear sample at continuous coordinates (pixel i spans [i, i+1]), or NaN outside. */
function sample(img: GrayImage, x: number, y: number): number {
  x -= 0.5
  y -= 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) return NaN
  const fx = x - x0
  const fy = y - y0
  const i = y0 * img.width + x0
  const d = img.data
  const top = d[i] + fx * (d[i + 1] - d[i])
  const bottom = d[i + img.width] + fx * (d[i + img.width + 1] - d[i + img.width])
  return top + fy * (bottom - top)
}

function insidePolygon([x, y]: Point, poly: Point[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function distanceToPolygon([x, y]: Point, poly: Point[]): number {
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j]
    const dx = poly[i][0] - ax
    const dy = poly[i][1] - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
    best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return best
}

/** Strongest dark→bright step along a ray, as the distance from the start, or null. */
function findEdge(img: GrayImage, c: Point, dir: Point, from: number, to: number): number | null {
  const profile: number[] = []
  for (let s = from - 0.5; s <= to + 0.5; s += STEP_PX) {
    profile.push(sample(img, c[0] + s * dir[0], c[1] + s * dir[1]))
  }
  // Gradient over 1 px, i.e. ±2 samples.
  const half = Math.round(0.5 / STEP_PX)
  let best = -1
  let bestG = MIN_EDGE
  const grad = (k: number): number => profile[k + half] - profile[k - half]
  for (let k = half; k < profile.length - half; k++) {
    const g = grad(k)
    if (g > bestG) {
      bestG = g
      best = k
    }
  }
  if (best < 0) return null
  // Parabolic peak interpolation for a sub-sample edge position.
  let offset = 0
  if (best > half && best < profile.length - half - 1) {
    const [a, b, c2] = [grad(best - 1), bestG, grad(best + 1)]
    const denom = a - 2 * b + c2
    if (denom < 0) offset = (0.5 * (a - c2)) / denom
  }
  return from - 0.5 + (best + offset) * STEP_PX
}

/** Limbus points from rays cast out of `c` toward both sides of the iris. */
function edgePoints(img: GrayImage, c: Point, r0: number, outline: Point[]): Point[] {
  const points: Point[] = []
  for (const side of [0, 1]) {
    for (let k = 0; k < RAYS_PER_SIDE; k++) {
      const angle = side * Math.PI + RAY_SPREAD * ((2 * k) / (RAYS_PER_SIDE - 1) - 1)
      const dir: Point = [Math.cos(angle), Math.sin(angle)]
      const s = findEdge(img, c, dir, SEARCH_MIN * r0, SEARCH_MAX * r0)
      if (s === null) continue
      const p: Point = [c[0] + s * dir[0], c[1] + s * dir[1]]
      if (!insidePolygon(p, outline) || distanceToPolygon(p, outline) < LID_MARGIN_PX) continue
      points.push(p)
    }
  }
  return points
}

interface Circle {
  center: Point
  radius: number
  /** Variance of the centre's x and y, px². */
  variance: Point
}

/**
 * Weighted least-squares circle through points, with the radius pulled toward `prior`.
 *
 * @param edgeSigma Expected scatter of edge points around the circle, px.
 */
function fitCircle(points: Point[], start: Point, prior: number, edgeSigma: number): Circle | null {
  let [cx, cy] = start
  let r = prior
  const we = 1 / edgeSigma ** 2
  const wr = 1 / (RADIUS_SIGMA * prior) ** 2
  let A: number[][] = []
  for (let it = 0; it < 15; it++) {
    // Gauss–Newton normal equations J^T W J delta = -J^T W e for (cx, cy, r).
    A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, wr]
    ]
    const b = [0, 0, -wr * (r - prior)]
    for (const [px, py] of points) {
      const d = Math.hypot(px - cx, py - cy) || 1e-9
      const j = [-(px - cx) / d, -(py - cy) / d, -1]
      const e = d - r
      for (let i = 0; i < 3; i++) {
        b[i] -= we * j[i] * e
        for (let k = 0; k < 3; k++) A[i][k] += we * j[i] * j[k]
      }
    }
    const delta = solve3(A, b)
    if (!delta) return null
    cx += delta[0]
    cy += delta[1]
    r += delta[2]
    if (Math.abs(delta[0]) + Math.abs(delta[1]) + Math.abs(delta[2]) < 1e-3) break
  }
  // Parameter covariance is the inverse of J^T W J; only its diagonal is needed.
  const vx = solve3(A, [1, 0, 0])
  const vy = solve3(A, [0, 1, 0])
  if (!vx || !vy) return null
  return { center: [cx, cy], radius: r, variance: [vx[0], vy[1]] }
}

/** Solves a 3x3 system by Cramer's rule, or null if singular. */
function solve3(A: number[][], b: number[]): number[] | null {
  const det = (m: number[][]): number =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  const d = det(A)
  if (Math.abs(d) < 1e-12) return null
  return [0, 1, 2].map(
    (col) => det(A.map((row, i) => row.map((v, k) => (k === col ? b[i] : v)))) / d
  )
}

const residuals = (points: Point[], center: Point, radius: number): number[] =>
  points.map(([x, y]) => Math.hypot(x - center[0], y - center[1]) - radius)

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Fits a circle, drops outliers (glints, lashes, the odd lid edge) and refits. */
function robustFit(points: Point[], start: Point, r0: number): Circle | null {
  if (points.length < MIN_POINTS) return null
  const first = fitCircle(points, start, r0, 1)
  if (!first) return null
  const res = residuals(points, first.center, first.radius)
  const spread = 1.4826 * median(res.map(Math.abs))
  const limit = Math.max(0.75, 2.5 * spread)
  const inliers = points.filter((_, i) => Math.abs(res[i]) <= limit)
  if (inliers.length < MIN_POINTS) return null
  const inlierRes = residuals(inliers, first.center, first.radius)
  const rms = Math.sqrt(inlierRes.reduce((s, e) => s + e * e, 0) / inlierRes.length)
  return fitCircle(inliers, first.center, r0, Math.max(EDGE_SIGMA_MIN_PX, rms))
}

/**
 * Refines one iris centre.
 *
 * The edge fit and MediaPipe's centre are combined per axis by how certain each is, so an axis
 * the visible edges don't pin down (usually vertical, when the lids hide the top and bottom of
 * the iris) stays close to MediaPipe.
 *
 * @param img Greyscale crop containing the eye.
 * @param guess MediaPipe's iris centre and radius, in crop px.
 * @param outline Eyelid outline, in crop px.
 * @returns The refined centre in crop px, or null when the edge evidence isn't convincing
 *   (the caller should then keep MediaPipe's centre).
 */
export function refineIrisCenter(img: GrayImage, guess: IrisGuess, outline: Point[]): Point | null {
  const { center: c, radius: r0 } = guess
  if (r0 < MIN_RADIUS_PX) return null

  // A second pass from the first estimate casts rays closer to the iris's true normals.
  let circle = robustFit(edgePoints(img, c, r0, outline), c, r0)
  if (!circle) return null
  circle = robustFit(edgePoints(img, circle.center, r0, outline), circle.center, r0) ?? circle

  const shift = Math.hypot(circle.center[0] - c[0], circle.center[1] - c[1])
  if (shift > MAX_SHIFT * r0 || Math.abs(circle.radius - r0) > MAX_RADIUS_CHANGE * r0) return null

  const guessVariance = (GUESS_SIGMA * r0) ** 2
  return [0, 1].map((k) => {
    const w = guessVariance / (guessVariance + circle.variance[k])
    return c[k] + w * (circle.center[k] - c[k])
  }) as Point
}

/** 3x3 binomial blur, which keeps single noisy pixels from looking like edges. */
export function blur(img: GrayImage): GrayImage {
  const { width: w, height: h, data } = img
  const tmp = new Float32Array(data.length)
  const out = new Float32Array(data.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const l = data[x > 0 ? i - 1 : i]
      const r = data[x < w - 1 ? i + 1 : i]
      tmp[i] = (l + 2 * data[i] + r) / 4
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const u = tmp[y > 0 ? i - w : i]
      const d = tmp[y < h - 1 ? i + w : i]
      out[i] = (u + 2 * tmp[i] + d) / 4
    }
  }
  return { data: out, width: w, height: h }
}

export interface RefinerStats {
  /** Eyes attempted / refined since the last call to `takeStats`. */
  attempts: number
  refined: number
  /** Mean time per frame spent reading pixels and refining, ms. */
  meanMs: number
}

/** Reads both eyes from each video frame and refines MediaPipe's iris centres. */
export class IrisRefiner {
  private readonly canvas = new OffscreenCanvas(1, 1)
  private readonly ctx = this.canvas.getContext('2d', { willReadFrequently: true })!
  private attempts = 0
  private refined = 0
  private frames = 0
  private totalMs = 0

  /**
   * @param frame The video the landmarks were detected on, at its native resolution.
   * @returns Per eye (A, B), the refined centre in normalised image coordinates, or null to
   *   keep MediaPipe's.
   */
  refine(
    frame: HTMLVideoElement,
    landmarks: NormalizedLandmark[]
  ): (Pick<NormalizedLandmark, 'x' | 'y'> | null)[] {
    const start = performance.now()
    const W = frame.videoWidth
    const H = frame.videoHeight
    const toPx = (i: number): Point => [landmarks[i].x * W, landmarks[i].y * H]

    const eyes = IRIS_EYES.map((eye) => {
      const center = toPx(eye.center)
      const radius =
        eye.edges.reduce((sum, i) => {
          const [x, y] = toPx(i)
          return sum + Math.hypot(x - center[0], y - center[1])
        }, 0) / eye.edges.length
      return { guess: { center, radius }, outline: eye.outline.map(toPx) }
    })

    // One crop covering both eyes: a single pixel readback per frame.
    const all = eyes.flatMap((e) => [
      ...e.outline,
      [e.guess.center[0] - SEARCH_MAX * e.guess.radius, e.guess.center[1]] as Point,
      [e.guess.center[0] + SEARCH_MAX * e.guess.radius, e.guess.center[1]] as Point
    ])
    const pad = 4
    const x0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p[0])) - pad))
    const y0 = Math.max(0, Math.floor(Math.min(...all.map((p) => p[1])) - pad))
    const x1 = Math.min(W, Math.ceil(Math.max(...all.map((p) => p[0])) + pad))
    const y1 = Math.min(H, Math.ceil(Math.max(...all.map((p) => p[1])) + pad))
    const w = x1 - x0
    const h = y1 - y0
    if (w < 8 || h < 8) return [null, null]

    if (this.canvas.width < w || this.canvas.height < h) {
      this.canvas.width = Math.max(this.canvas.width, w)
      this.canvas.height = Math.max(this.canvas.height, h)
    }
    this.ctx.drawImage(frame, x0, y0, w, h, 0, 0, w, h)
    const rgba = this.ctx.getImageData(0, 0, w, h).data
    const gray = new Float32Array(w * h)
    for (let i = 0; i < gray.length; i++) {
      gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
    }
    const img = blur({ data: gray, width: w, height: h })

    const shift = (p: Point): Point => [p[0] - x0, p[1] - y0]
    const result = eyes.map(({ guess, outline }) => {
      this.attempts++
      const refined = refineIrisCenter(
        img,
        { center: shift(guess.center), radius: guess.radius },
        outline.map(shift)
      )
      if (!refined) return null
      this.refined++
      return { x: (refined[0] + x0) / W, y: (refined[1] + y0) / H }
    })

    this.frames++
    this.totalMs += performance.now() - start
    return result
  }

  /** Returns counters since the last call and resets them. */
  takeStats(): RefinerStats {
    const stats = {
      attempts: this.attempts,
      refined: this.refined,
      meanMs: this.frames ? this.totalMs / this.frames : 0
    }
    this.attempts = this.refined = this.frames = this.totalMs = 0
    return stats
  }
}
