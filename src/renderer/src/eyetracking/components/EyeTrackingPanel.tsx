import { useCallback, useState } from 'react'
import { useGaze, useGazeTracker, useTrackerState } from '../hooks'
import type { CalibrationResult } from '../types'
import { CalibrationOverlay } from './CalibrationOverlay'
import { CameraPreview } from './CameraPreview'
import { GazeCursor } from './GazeCursor'

function GazeReadout(): React.JSX.Element {
  const gaze = useGaze()
  if (!gaze) return <span className="et-panel__muted">no gaze yet</span>
  return (
    <span className="et-panel__mono">
      {Math.round(gaze.x)}, {Math.round(gaze.y)}
      {gaze.blinking ? ' (blink)' : ''}
    </span>
  )
}

/** Status and controls for eye tracking: calibration, camera preview, gaze cursor. */
export function EyeTrackingPanel(): React.JSX.Element {
  const tracker = useGazeTracker()
  const { status, error, faceDetected, calibrated } = useTrackerState()
  const [calibrating, setCalibrating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  const [result, setResult] = useState<CalibrationResult | null>(null)

  const handleComplete = useCallback((r: CalibrationResult) => {
    setResult(r)
    setCalibrating(false)
  }, [])
  const handleCancel = useCallback(() => setCalibrating(false), [])

  return (
    <>
      <div className="et-panel">
        <div className="et-panel__row">
          <span className={`et-panel__status et-panel__status--${status}`}>{status}</span>
          {status === 'running' && (
            <span className={faceDetected ? 'et-panel__ok' : 'et-panel__warn'}>
              {faceDetected ? 'Face detected' : 'No face'}
            </span>
          )}
          {calibrated && <GazeReadout />}
        </div>
        {error && <p className="et-panel__error">{error}</p>}
        {result && (
          <p className="et-panel__muted">
            Calibration accuracy: ~{Math.round(result.meanErrorPx)}px average error
          </p>
        )}
        <div className="et-panel__row">
          <button onClick={() => setCalibrating(true)} disabled={status !== 'running'}>
            {calibrated ? 'Recalibrate' : 'Calibrate'}
          </button>
          <button onClick={() => setShowCamera((v) => !v)}>
            {showCamera ? 'Hide camera' : 'Show camera'}
          </button>
          <button onClick={() => setShowCursor((v) => !v)} disabled={!calibrated}>
            {showCursor ? 'Hide gaze dot' : 'Show gaze dot'}
          </button>
          {status === 'error' && <button onClick={() => tracker.start()}>Retry camera</button>}
        </div>
        {showCamera && <CameraPreview />}
      </div>
      {calibrated && showCursor && !calibrating && <GazeCursor />}
      {calibrating && <CalibrationOverlay onComplete={handleComplete} onCancel={handleCancel} />}
    </>
  )
}
