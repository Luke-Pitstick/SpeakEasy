import { useEffect, useRef } from 'react'
import { useGazeTracker, useTrackerState } from '../hooks'

/** Mirrored live view of the tracking camera, useful for positioning yourself. */
export function CameraPreview(): React.JSX.Element {
  const tracker = useGazeTracker()
  const { status } = useTrackerState()
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.srcObject = status === 'running' ? tracker.mediaStream : null
  }, [tracker, status])

  return <video ref={ref} className="camera-preview" autoPlay muted playsInline />
}
