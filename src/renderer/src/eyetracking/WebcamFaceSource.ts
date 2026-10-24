import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatures } from './features'
import type { EyeFeatures } from './types'

const assetBase = new URL('mediapipe/', document.baseURI).href
const FIRST_FRAME_TIMEOUT_MS = 10000

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
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: false
    })
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
    if (landmarks && landmarks.length >= 478) {
      const aspect = this.video.videoWidth / this.video.videoHeight
      const matrix = result.facialTransformationMatrixes?.[0]?.data
      this.onFeatures(extractFeatures(landmarks, matrix, aspect, now))
    } else {
      this.onFeatures(null)
    }
    this.scheduleFrame()
  }
}
