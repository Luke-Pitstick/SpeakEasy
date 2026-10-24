import { useEffect, useState } from 'react'
import {
  EyeTrackingPanel,
  GazeProvider,
  useGazeSelect,
  useGazeTarget,
  useGazeTracker
} from './eyetracking'

const TILES = ['Hello', 'Yes', 'No', 'Help', 'Thank you', 'Water', 'Food', 'Rest', 'Goodbye']

/** Test surface: look at a tile to highlight it, keep looking to select it. */
function GazeTiles(): React.JSX.Element {
  const tracker = useGazeTracker()
  const target = useGazeTarget()
  const [selected, setSelected] = useState<string[]>([])

  useGazeSelect((id) => setSelected((s) => [...s, id]))

  // Esc undoes the last selection. Undoing also tells the tracker not to learn from it:
  // it was probably the wrong target.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      tracker.cancelPendingLearning()
      setSelected((s) => s.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tracker])

  return (
    <>
      <div className="selection-log">
        {selected.length ? selected.slice(-8).join(' · ') : 'Look at a tile to select it'}
        {selected.length > 0 && <span className="selection-log__hint">Esc to undo</span>}
      </div>
      <div className="tiles">
        {TILES.map((label) => (
          <div
            key={label}
            data-gaze-target={label}
            className={`tile${target === label ? ' tile--gazed' : ''}`}
          >
            {label}
          </div>
        ))}
      </div>
    </>
  )
}

function App(): React.JSX.Element {
  return (
    <GazeProvider>
      <div className="app">
        <EyeTrackingPanel />
        <GazeTiles />
      </div>
    </GazeProvider>
  )
}

export default App
