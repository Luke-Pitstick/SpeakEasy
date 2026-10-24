import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
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
 * The `data-gaze-target` value of the element currently being looked at (after aim assist),
 * or null. Only re-renders when the target changes.
 */
export function useGazeTarget(): string | null {
  const tracker = useGazeTracker()
  const [target, setTarget] = useState<string | null>(tracker.latestGaze?.target ?? null)
  useEffect(() => tracker.onGaze((gaze) => setTarget(gaze.target)), [tracker])
  return target
}

/** Calls `onSelect` with the `data-gaze-target` id whenever a target is selected by dwelling. */
export function useGazeSelect(onSelect: (id: string) => void): void {
  const tracker = useGazeTracker()
  const callback = useRef(onSelect)
  useEffect(() => {
    callback.current = onSelect
  })
  useEffect(() => tracker.onSelect((id) => callback.current(id)), [tracker])
}
