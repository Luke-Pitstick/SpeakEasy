import { useEffect, useState, type ReactNode } from 'react'
import { GazeTracker } from './GazeTracker'
import { GazeContext } from './hooks'

/** Owns the app-wide gaze tracker and starts the camera while mounted. */
export function GazeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [tracker] = useState(() => new GazeTracker())

  useEffect(() => {
    tracker.start()
    return () => tracker.stop()
  }, [tracker])

  return <GazeContext.Provider value={tracker}>{children}</GazeContext.Provider>
}
