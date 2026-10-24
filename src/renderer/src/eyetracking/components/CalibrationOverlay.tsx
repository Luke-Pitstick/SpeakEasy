import { useEffect, useState } from 'react'
import type { CalibrationPhase, CalibrationSample } from '../GazeTracker'
import {
  averagePose,
  poseProgress,
  POSES,
  toUserPose,
  type PoseInstruction,
  type UserPose
} from '../headPose'
import { useGazeTracker } from '../hooks'
import type { CalibrationResult } from '../types'

// Fractions of the window. Training points cover the edges; validation points sit between
// them so accuracy is measured on positions the model never saw.
const TRAIN_POINTS: [number, number][] = [
  [0.5, 0.5],
  [0.08, 0.08],
  [0.5, 0.08],
  [0.92, 0.08],
  [0.92, 0.5],
  [0.92, 0.92],
  [0.5, 0.92],
  [0.08, 0.92],
  [0.08, 0.5],
  // Extra lower points: looking down is where iris tracking is weakest (the lids cover it).
  [0.3, 0.75],
  [0.7, 0.75]
]
const VALIDATION_POINTS: [number, number][] = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.3, 0.6],
  [0.7, 0.6],
  [0.5, 0.85]
]
// Looking at a dot while moving the head lets calibration learn how eye and head rotation
// combine, which a still-head calibration can't separate. Each move is a specific, measured
// pose so every axis (turn, tilt, distance, sideways) gets covered.
const MOTION_PLAN: { pos: [number, number]; poses: PoseInstruction[] }[] = [
  { pos: [0.5, 0.5], poses: [POSES.turnLeft, POSES.turnRight, POSES.tiltUp, POSES.tiltDown] },
  { pos: [0.2, 0.25], poses: [POSES.leanIn, POSES.leanBack] },
  { pos: [0.8, 0.25], poses: [POSES.slideLeft, POSES.slideRight] },
  { pos: [0.8, 0.75], poses: [POSES.turnLeft, POSES.tiltUp] },
  { pos: [0.2, 0.75], poses: [POSES.turnRight, POSES.tiltDown] }
]
const SETTLE_MS = 800
const COLLECT_MS = 1200
const HOLD_MS = 1000
const POSE_TIMEOUT_MS = 7000
// Pose card geometry (px): matches .pose-card width; gap is from the dot's centre.
const CARD_HALF_WIDTH = 150
const CARD_GAP = 34
/** Fraction of an instruction's movement that counts as reaching the pose. */
const REACHED = 0.8

interface Props {
  onComplete: (result: CalibrationResult) => void
  onCancel: () => void
}

interface DotState {
  pos: [number, number]
  collecting: boolean
  instruction?: PoseInstruction
  progress?: number
  status?: 'moving' | 'holding' | 'skipped'
}

/** Full-window calibration: the user follows a dot while eye samples are recorded. */
export function CalibrationOverlay({ onComplete, onCancel }: Props): React.JSX.Element {
  const tracker = useGazeTracker()
  const [dot, setDot] = useState<DotState | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The still phase sets the reference posture tracking is most precise at, so ask for the
  // posture the user will actually use rather than an upright "calibration" pose.
  const [intro, setIntro] = useState(
    'Sit the way you normally will when using the app, keep your head there, and follow the dot with your eyes.'
  )

  useEffect(() => {
    let cancelled = false
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const toClient = ([fx, fy]: [number, number]): [number, number] => [
      fx * window.innerWidth,
      fy * window.innerHeight
    ]

    const record = async (
      points: [number, number][],
      phase: CalibrationPhase
    ): Promise<CalibrationSample[]> => {
      const all: CalibrationSample[] = []
      for (const pos of points) {
        if (cancelled) break
        setDot({ pos, collecting: false })
        await wait(SETTLE_MS)
        if (cancelled) break
        setDot({ pos, collecting: true })
        all.push(...(await tracker.collectSamples(...toClient(pos), COLLECT_MS, phase)))
      }
      return all
    }

    const captureNeutral = async (): Promise<UserPose> => {
      const poses: UserPose[] = []
      const unsubscribe = tracker.onHead((head) => poses.push(toUserPose(head)))
      await wait(1000)
      unsubscribe()
      return averagePose(poses)
    }

    /** Shows one instruction, waits for the pose, then records while it is held. */
    const recordPose = async (
      pos: [number, number],
      instruction: PoseInstruction,
      neutral: UserPose
    ): Promise<CalibrationSample[]> => {
      let progress = 0
      let status: DotState['status'] = 'moving'
      const show = (): void => setDot({ pos, collecting: true, instruction, progress, status })
      show()
      let onReached: () => void = () => {}
      const reached = new Promise<void>((r) => (onReached = r))
      const unsubscribe = tracker.onHead((head) => {
        progress = poseProgress(toUserPose(head), neutral, instruction)
        if (progress >= REACHED) onReached()
        show()
      })
      try {
        const ok = await Promise.race([
          reached.then(() => true),
          wait(POSE_TIMEOUT_MS).then(() => false)
        ])
        if (cancelled) return []
        if (!ok) {
          status = 'skipped'
          show()
          await wait(600)
          return []
        }
        status = 'holding'
        show()
        return await tracker.collectSamples(...toClient(pos), HOLD_MS, 'motion')
      } finally {
        unsubscribe()
      }
    }

    ;(async () => {
      await wait(1000)
      const still = await record(TRAIN_POINTS, 'still')

      const moving: CalibrationSample[] = []
      if (!cancelled) {
        setDot(null)
        setIntro(
          'Next, keep your eyes on the dot and move your head as instructed. Hold each pose until the bar turns green.'
        )
        await wait(4000)
      }
      if (!cancelled) {
        setDot({ pos: [0.5, 0.5], collecting: false })
        const neutral = await captureNeutral()
        for (const { pos, poses } of MOTION_PLAN) {
          if (cancelled) break
          // Neutral samples at each dot anchor the moves around it.
          moving.push(...(await record([pos], 'motion')))
          for (const instruction of poses) {
            if (cancelled) break
            moving.push(...(await recordPose(pos, instruction, neutral)))
          }
        }
      }

      if (!cancelled) {
        setDot(null)
        setIntro('Last step: hold your head however is comfortable and follow the dot.')
        await wait(2500)
      }
      const validation = await record(VALIDATION_POINTS, 'validation')
      if (cancelled) return
      const train = [...still, ...moving]
      try {
        tracker.calibrate(train)
        const result = tracker.evaluate(validation)
        // Accuracy is reported from held-out points; the final model then uses all data.
        tracker.calibrate([...train, ...validation])
        onComplete(result)
      } catch (err) {
        setDot(null)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tracker, onComplete])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="calibration">
      {error ? (
        <div className="calibration__message">
          <p>{error}</p>
          <button onClick={onCancel}>Close</button>
        </div>
      ) : dot ? (
        <>
          {dot.instruction && <PoseCard dot={dot} instruction={dot.instruction} />}
          <div
            className={`calibration__dot${dot.collecting ? ' calibration__dot--collecting' : ''}`}
            style={{ left: `${dot.pos[0] * 100}%`, top: `${dot.pos[1] * 100}%` }}
          />
        </>
      ) : (
        <div className="calibration__message">
          <p>{intro}</p>
          <p className="calibration__hint">Press Esc to cancel</p>
        </div>
      )}
    </div>
  )
}

function PoseCard({
  dot,
  instruction
}: {
  dot: DotState
  instruction: PoseInstruction
}): React.JSX.Element {
  const status =
    dot.status === 'holding'
      ? 'Hold it…'
      : dot.status === 'skipped'
        ? 'Skipped, moving on'
        : 'Keep your eyes on the dot'
  return (
    // Anchored just below the dot (above it in the lower half) so it can be read without
    // looking away; clamped horizontally to stay on screen.
    <div
      className="pose-card"
      style={{
        left: `clamp(${CARD_HALF_WIDTH}px, ${dot.pos[0] * 100}%, calc(100% - ${CARD_HALF_WIDTH}px))`,
        ...(dot.pos[1] < 0.5
          ? { top: `calc(${dot.pos[1] * 100}% + ${CARD_GAP}px)` }
          : { bottom: `calc(${(1 - dot.pos[1]) * 100}% + ${CARD_GAP}px)` })
      }}
    >
      <div className="pose-card__instruction">
        <span className="pose-card__arrow">{instruction.arrow}</span>
        <span className="pose-card__text">{instruction.text}</span>
      </div>
      <div className="pose-card__bar">
        <div
          className={`pose-card__fill${(dot.progress ?? 0) >= REACHED ? ' pose-card__fill--ok' : ''}`}
          style={{ width: `${Math.round((dot.progress ?? 0) * 100)}%` }}
        />
        <div className="pose-card__goal" style={{ left: `${REACHED * 100}%` }} />
      </div>
      <div className="calibration__hint">{status}</div>
    </div>
  )
}
