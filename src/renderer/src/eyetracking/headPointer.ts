import { toUserPose } from './headPose'
import type { HeadPose } from './types'

export interface HeadPointerOptions {
  /** 1 = default range of motion; higher moves the cursor further per degree. */
  sensitivity: number
}

export const DEFAULT_HEAD_POINTER: HeadPointerOptions = { sensitivity: 1 }

// At sensitivity 1, turning this far from centre reaches the side edges, and tilting this far
// reaches the top/bottom. Small enough to be comfortable, large enough that the ~0.1° frame
// noise in MediaPipe's head pose is only a few px.
const HALF_YAW_DEG = 10
const HALF_PITCH_DEG = 7

export interface HeadPoint {
  x: number
  y: number
  offscreen: boolean
}

export interface Neutral {
  yaw: number
  pitch: number
}

/**
 * Head pointing: the cursor follows where the face points (head turn and tilt), relative to a
 * neutral pose captured while pointing at the screen centre. Unlike eye gaze it can't drift
 * out from under the user: they see the cursor and steer it. Pointing past an edge holds the
 * cursor at that edge; the centre never moves on its own, only when re-centred.
 */
export class HeadPointer {
  neutral: Neutral | null = null

  constructor(public options: HeadPointerOptions = { ...DEFAULT_HEAD_POINTER }) {}

  /** Sets the neutral pose from head poses recorded while pointing at the centre. */
  center(poses: HeadPose[]): void {
    if (poses.length === 0) return
    const user = poses.map(toUserPose)
    this.neutral = {
      yaw: user.reduce((s, p) => s + p.yaw, 0) / user.length,
      pitch: user.reduce((s, p) => s + p.pitch, 0) / user.length
    }
  }

  /**
   * Maps a head pose to a point in a `width` x `height` area (window CSS px), or null before
   * centring. Clamped to the area, leaving the neutral pose unchanged; `offscreen` says the face
   * points past an edge, so the pinned point isn't mistaken for hovering whatever is there.
   */
  point(head: HeadPose, width: number, height: number): HeadPoint | null {
    const n = this.neutral
    if (!n) return null
    const { yaw, pitch } = toUserPose(head)
    const gx = (width / 2 / HALF_YAW_DEG) * this.options.sensitivity
    const gy = (height / 2 / HALF_PITCH_DEG) * this.options.sensitivity
    const x = width / 2 + (yaw - n.yaw) * gx
    const y = height / 2 - (pitch - n.pitch) * gy

    const cx = Math.max(0, Math.min(width, x))
    const cy = Math.max(0, Math.min(height, y))
    return { x: cx, y: cy, offscreen: cx !== x || cy !== y }
  }
}
