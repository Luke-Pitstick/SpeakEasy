import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { extractFeatures } from './features'
import { IrisRefiner } from './irisRefine'
import type { EyeFeatures } from './types'

const assetBase = new URL('mediapipe/', document.baseURI).href
const FIRST_FRAME_TIMEOUT_MS = 10000
const STATS_INTERVAL_MS = 30000
/** At most one logged frame error per this many ms, so a persistent error doesn't flood. */
const ERROR_LOG_INTERVAL_MS = 5000

export interface CameraInfo {
  id: string
  label: string
}

/**
 * The camera to use when none was chosen: macOS can offer a nearby iPhone (Continuity Camera)
 * as "the" front camera, and that one isn't pointed at the user's face. Prefer the built-in
 * camera, else any camera that isn't a phone or Desk View. Null if labels aren't available yet
 * (before camera permission), leaving the choice to the system.
 */
export function preferredCamera(cameras: { id: string; label: string }[]): string | null {
  const builtIn = cameras.find((c) => /facetime|built-?in|integrated/i.test(c.label))
  if (builtIn) return builtIn.id
  const other = cameras.find((c) => c.label && !/iphone|continuity|desk view/i.test(c.label))
  return other?.id ?? null
}

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
  private lastErrorLog = -Infinity
  /** Camera to open (a deviceId), or null for the default front camera. */
  deviceId: string | null = null
  /** The camera actually opened, once started. */
  camera: CameraInfo | null = null

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

    // With no chosen camera, pick the built-in one rather than whatever macOS calls "front".
    const preferred = this.deviceId ? null : preferredCamera(await this.listCameras())
    const open = (cameraId: string | null): Promise<MediaStream> =>
      navigator.mediaDevices.getUserMedia({
        // 720p is the setting real calibration data was clean with; 1080p/60 coincided with
        // eyelid measurements becoming ~3× noisier, and frames still arrived at ~30 fps.
        video: {
          ...(this.refiner
            ? { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } }),
          ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: 'user' })
        },
        audio: false
      })
    // An automatically preferred camera that won't open falls back to the system's choice; a
    // camera the user chose fails loudly (the tracker then forgets it).
    const stream = this.deviceId
      ? await open(this.deviceId)
      : await open(preferred).catch(() => open(null))
    const track = stream.getVideoTracks()[0]
    const { width, height, frameRate, deviceId } = track.getSettings()
    console.info(`[gaze] ${track.label}: ${width}x${height} @ ${frameRate?.toFixed(0)} fps`)
    this.camera = { id: deviceId ?? '', label: track.label }
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

  /** The video cameras available (labels need camera permission, so call after starting). */
  async listCameras(): Promise<CameraInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
  }

  private processFrame(): void {
    if (!this.running || !this.landmarker) return
    const now = performance.now()
    // An error on one frame (in detection or anything downstream) must not stop tracking for
    // good: log it and carry on with the next frame.
    try {
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
    } catch (err) {
      if (now - this.lastErrorLog > ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLog = now
        console.error('[gaze] frame processing failed', err)
      }
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
