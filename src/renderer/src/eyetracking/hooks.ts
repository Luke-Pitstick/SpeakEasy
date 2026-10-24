import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { GazeTracker, TrackerState } from './GazeTracker'
import type { GazePoint } from './types'

export const GazeContext = createContext<GazeTracker | null>(null)

export function useGazeTracker(): GazeTracker {
  const tracker = useContext(GazeContext)
  if (!tracker) throw new Error('useGazeTracker must be used inside <GazeProvider>')
  return tracker
}

export function useTrackerState(): TrackerState {
  const tracker = useGazeTracker()
  return useSyncExternalStore(tracker.subscribe, tracker.getState)
}

/**
 * Latest gaze point, re-rendering on every camera frame. For per-frame visuals prefer
 * `tracker.onGaze` with a ref to avoid React renders.
 */
export function useGaze(): GazePoint | null {
  const tracker = useGazeTracker()
  const [gaze, setGaze] = useState<GazePoint | null>(tracker.latestGaze)
  useEffect(() => tracker.onGaze(setGaze), [tracker])
  return gaze
}

/**
 * The `data-gaze-target` value of the element currently being looked at, or null.
 * Only re-renders when the target changes.
 */
export function useGazeTarget(): string | null {
  const tracker = useGazeTracker()
  const [target, setTarget] = useState<string | null>(null)
  useEffect(
    () =>
      tracker.onGaze((gaze) => {
        const el = document.elementFromPoint(gaze.x, gaze.y)?.closest('[data-gaze-target]')
        setTarget(el?.getAttribute('data-gaze-target') ?? null)
      }),
    [tracker]
  )
  return target
}
