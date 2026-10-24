import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatures } from './features'
import { IrisRefiner } from './irisRefine'
import type { EyeFeatures } from './types'

const assetBase = new URL('mediapipe/', document.baseURI).href
const FIRST_FRAME_TIMEOUT_MS = 10000
const STATS_INTERVAL_MS = 30000

async function loadLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(assetBase + 'wasm')
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: assetBase + 'face_landmarker.task', delegate: 'GPU' },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFacialTransformationMatrixes: true
  })
}

/**
 * Runs the webcam through MediaPipe's face landmarker and emits eye features once per
 * video frame. Swappable later for a hardware eye tracker that produces the same features.
 */
export class WebcamFaceSource {
  private readonly video: HTMLVideoElement
  private stream: MediaStream | null = null
  private landmarker: FaceLandmarker | null = null
  private loading: Promise<FaceLandmarker> | null = null
  private running = false
  private frameHandle = 0
  // Off by default: on real calibration data the refined iris centres were far noisier than
  // MediaPipe's (vertical frame-to-frame noise up 40–70×; gaze jitter ~10 px -> ~80 px after
  // smoothing). Set localStorage 'speakeasy.irisRefine' to 'on' to experiment with it.
  private readonly refiner = readFlag('speakeasy.irisRefine') === 'on' ? new IrisRefiner() : null
  private lastStatsLog = 0

  constructor(private readonly onFeatures: (features: EyeFeatures | null) => void) {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.playsInline = true
    // Chromium pauses detached media elements, so keep the source video in the DOM, hidden.
    this.video.className = 'gaze-source-video'
    document.body.appendChild(this.video)
  }

  /** The live camera stream while running, for previews. */
  get mediaStream(): MediaStream | null {
    return this.stream
  }

  async start(): Promise<void> {
    this.running = true
    this.loading ??= loadLandmarker()
    this.landmarker = await this.loading
    if (!this.running || this.stream) return

    const stream = await navigator.mediaDevices.getUserMedia({
      // 720p is the setting real calibration data was clean with; 1080p/60 coincided with
      // eyelid measurements becoming ~3× noisier, and frames still arrived at ~30 fps.
      video: this.refiner
        ? {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 60 },
            facingMode: 'user'
          }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    })
    const track = stream.getVideoTracks()[0]
    const { width, height, frameRate } = track.getSettings()
    console.info(`[gaze] ${track.label}: ${width}x${height} @ ${frameRate?.toFixed(0)} fps`)
    if (!this.running || this.stream) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    this.stream = stream
    this.video.srcObject = stream
    // macOS can hand out a "live" stream that never delivers frames when camera access is
    // denied at the OS level, so fail loudly instead of waiting forever.
    let timer = 0
    await Promise.race([
      this.video.play(),
      new Promise((_, reject) => {
        timer = window.setTimeout(
          () =>
            reject(
              new Error(
                'Camera is not sending frames. Check System Settings › Privacy & Security › Camera.'
              )
            ),
          FIRST_FRAME_TIMEOUT_MS
        )
      })
    ]).finally(() => clearTimeout(timer))
    this.scheduleFrame()
  }

  stop(): void {
    this.running = false
    this.video.cancelVideoFrameCallback(this.frameHandle)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null
    this.video.srcObject = null
  }

  private scheduleFrame(): void {
    this.frameHandle = this.video.requestVideoFrameCallback(() => this.processFrame())
  }

  private processFrame(): void {
    if (!this.running || !this.landmarker) return
    const now = performance.now()
    const result = this.landmarker.detectForVideo(this.video, now)
    const landmarks = result.faceLandmarks[0]
    const matrix = result.facialTransformationMatrixes?.[0]?.data
    if (landmarks && landmarks.length >= 478 && matrix?.length === 16) {
      const aspect = this.video.videoWidth / this.video.videoHeight
      const iris = this.refiner?.refine(this.video, landmarks)
      this.onFeatures(extractFeatures(landmarks, matrix, aspect, now, iris))
      this.logRefinerStats(now)
    } else {
      this.onFeatures(null)
    }
    this.scheduleFrame()
  }

  private logRefinerStats(now: number): void {
    if (!this.refiner || now - this.lastStatsLog < STATS_INTERVAL_MS) return
    this.lastStatsLog = now
    const { attempts, refined, meanMs } = this.refiner.takeStats()
    if (attempts === 0) return
    const rate = ((100 * refined) / attempts).toFixed(0)
    console.info(`[gaze] iris refined ${rate}% of eyes, ${meanMs.toFixed(2)} ms/frame`)
  }
}

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
