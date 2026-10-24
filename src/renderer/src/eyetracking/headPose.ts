import type { HeadPose } from './types'

/** Head pose from the user's point of view, for giving movement instructions. */
export interface UserPose {
  /** Degrees, + = turned to the user's right. */
  yaw: number
  /** Degrees, + = tilted up. */
  pitch: number
  /** cm, + = moved to the user's right. */
  x: number
  /** cm, + = moved up. */
  y: number
  /** Distance from the camera, cm. */
  distance: number
}

export type PoseAxis = keyof UserPose

/**
 * Converts a camera-space head pose to the user's frame. Camera +x is the user's left, and an
 * unrotated face looks along camera +z toward the camera.
 */
export function toUserPose(head: HeadPose): UserPose {
  const R = head.rotation
  // Face forward vector = R * (0, 0, 1).
  const fx = R[2]
  const fy = R[5]
  const fz = R[8]
  const deg = 180 / Math.PI
  return {
    yaw: -Math.atan2(fx, fz) * deg,
    pitch: Math.asin(Math.max(-1, Math.min(1, fy))) * deg,
    x: -head.eye[0],
    y: head.eye[1],
    distance: -head.eye[2]
  }
}

export function averagePose(poses: UserPose[]): UserPose {
  const avg = (k: PoseAxis): number => poses.reduce((s, p) => s + p[k], 0) / poses.length
  return {
    yaw: avg('yaw'),
    pitch: avg('pitch'),
    x: avg('x'),
    y: avg('y'),
    distance: avg('distance')
  }
}

/** A deliberate head movement the user is asked to make, relative to their neutral pose. */
export interface PoseInstruction {
  text: string
  arrow: string
  axis: PoseAxis
  /** Required change from neutral along `axis`. */
  delta: number
}

export const POSES = {
  turnLeft: { text: 'Turn your head left', arrow: '←', axis: 'yaw', delta: -15 },
  turnRight: { text: 'Turn your head right', arrow: '→', axis: 'yaw', delta: 15 },
  tiltUp: { text: 'Tilt your head up', arrow: '↑', axis: 'pitch', delta: 10 },
  tiltDown: { text: 'Tilt your head down', arrow: '↓', axis: 'pitch', delta: -10 },
  leanIn: { text: 'Lean closer to the screen', arrow: '⤓', axis: 'distance', delta: -10 },
  leanBack: { text: 'Lean back from the screen', arrow: '⤒', axis: 'distance', delta: 10 },
  slideLeft: { text: 'Slide your head left (no turning)', arrow: '⇠', axis: 'x', delta: -6 },
  slideRight: { text: 'Slide your head right (no turning)', arrow: '⇢', axis: 'x', delta: 6 }
} satisfies Record<string, PoseInstruction>

/** How far (0..1) the user has moved toward an instruction's target. */
export function poseProgress(pose: UserPose, neutral: UserPose, step: PoseInstruction): number {
  return Math.max(0, Math.min(1, (pose[step.axis] - neutral[step.axis]) / step.delta))
}
