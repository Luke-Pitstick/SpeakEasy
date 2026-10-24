import { useEffect, useState, type ReactNode } from 'react'
import { GazeTracker } from './GazeTracker'
import { GazeContext } from './hooks'

/**
 * Owns the app-wide gaze tracker. The camera runs only while `active` (an eye or head input is
 * selected), so mouse-only use never opens it.
 */
export function GazeProvider({
  active,
  children
}: {
  active: boolean
  children: ReactNode
}): React.JSX.Element {
  const [tracker] = useState(() => new GazeTracker())

  useEffect(() => {
    if (!active) return
    tracker.start()
    return () => tracker.stop()
  }, [tracker, active])

  return <GazeContext.Provider value={tracker}>{children}</GazeContext.Provider>
}
