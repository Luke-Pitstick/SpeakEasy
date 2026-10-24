import { useEffect } from 'react'
import { useGazeTracker } from '../hooks'

// Time to get the nose onto the dot, then the window of head poses averaged as "centre".
const AIM_MS = 1800
const CAPTURE_MS = 600

interface Props {
  onDone: () => void
  onCancel: () => void
}

/** Two seconds of pointing the face at a centre dot, to set the head pointer's neutral pose. */
export function HeadCenterOverlay({ onDone, onCancel }: Props): React.JSX.Element {
  const tracker = useGazeTracker()

  useEffect(() => {
    const timer = setTimeout(() => {
      tracker.centerHeadPointer(CAPTURE_MS)
      onDone()
    }, AIM_MS + CAPTURE_MS)
    return () => clearTimeout(timer)
  }, [tracker, onDone])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="calibration">
      <div
        className="calibration__dot calibration__dot--collecting"
        style={{ left: '50%', top: '50%' }}
      />
      <p className="drift-test__countdown">Point your nose at the dot and hold still</p>
    </div>
  )
}
