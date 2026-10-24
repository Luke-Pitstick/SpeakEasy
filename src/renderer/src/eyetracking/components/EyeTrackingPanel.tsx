import { useCallback, useState } from 'react'
import { useGaze, useGazeTracker, useTrackerState } from '../hooks'
import type { DriftSummary, GazeTracker } from '../GazeTracker'
import type { CalibrationResult } from '../types'
import { CalibrationOverlay } from './CalibrationOverlay'
import { CameraPreview } from './CameraPreview'
import { ClickRefinement } from './ClickRefinement'
import { DriftTestOverlay } from './DriftTestOverlay'
import { GazeCursor } from './GazeCursor'
import { HeadCenterOverlay } from './HeadCenterOverlay'
import { HeadPositionGuide } from './HeadPositionGuide'
import { LearningFeedback } from './LearningFeedback'

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

/** "62px left, 40px up"-style description of a (predicted - true) offset. */
function describeOffset([dx, dy]: [number, number]): string {
  const x = `${Math.round(Math.abs(dx))}px ${dx < 0 ? 'left' : 'right'}`
  const y = `${Math.round(Math.abs(dy))}px ${dy < 0 ? 'up' : 'down'}`
  return `${x}, ${y}`
}

/** Saves the calibration data as a JSON file, for offline analysis. */
function downloadCalibration(tracker: GazeTracker): void {
  const json = tracker.exportCalibration()
  if (!json) return
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `speakeasy-calibration-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Status and controls for gaze input: calibration, camera preview, pointer dot, aim assist,
 * dwell, and learning; plus pointer mode and head-pointer centring when that flag is on.
 */
export function EyeTrackingPanel(): React.JSX.Element {
  const tracker = useGazeTracker()
  const {
    status,
    error,
    faceDetected,
    calibrated,
    aimAssist,
    dwell,
    learnedClicks,
    learnedSelections,
    canRefine,
    headPointerAvailable,
    pointerMode,
    headPointer,
    headCentered
  } = useTrackerState()
  const [calibrating, setCalibrating] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [showCursor, setShowCursor] = useState(true)
  const [learnFromClicks, setLearnFromClicks] = useState(false)
  const [result, setResult] = useState<CalibrationResult | null>(null)

  const handleComplete = useCallback((r: CalibrationResult) => {
    setResult(r)
    setCalibrating(false)
  }, [])
  const handleCancel = useCallback(() => setCalibrating(false), [])
  const [driftTesting, setDriftTesting] = useState(false)
  const [drift, setDrift] = useState<DriftSummary | null>(null)
  const handleDriftComplete = useCallback((d: DriftSummary) => {
    setDrift(d)
    setDriftTesting(false)
  }, [])
  const handleDriftCancel = useCallback(() => setDriftTesting(false), [])
  const [centering, setCentering] = useState(false)
  // Cancelling the automatic centring shouldn't immediately reopen it.
  const [centerDismissed, setCenterDismissed] = useState(false)
  const handleCentered = useCallback(() => setCentering(false), [])
  const handleCenterCancel = useCallback(() => {
    setCentering(false)
    setCenterDismissed(true)
  }, [])
  const eyes = pointerMode === 'eyes'
  // Whether anything is driving the pointer yet.
  const pointing = eyes ? calibrated : headCentered
  // Head pointing needs centring once per session: start it as soon as the face is visible.
  const autoCentering =
    !eyes &&
    !headCentered &&
    !centerDismissed &&
    status === 'running' &&
    faceDetected &&
    !calibrating &&
    !driftTesting
  const showCentering = centering || autoCentering
  const overlayOpen = calibrating || driftTesting || showCentering

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
          {pointing && <GazeReadout />}
        </div>
        {error && <p className="et-panel__error">{error}</p>}
        {result && (
          <p className="et-panel__muted">
            Calibration: ~{Math.round(result.meanErrorPx)}px average error
            {Math.abs(result.verticalBiasPx) >= 10 &&
              ` · reads ${Math.round(Math.abs(result.verticalBiasPx))}px too ${result.verticalBiasPx < 0 ? 'high' : 'low'}`}
            {!Number.isNaN(result.bottomErrorPx) &&
              ` · bottom of screen ~${Math.round(result.bottomErrorPx)}px`}
          </p>
        )}
        {drift && (
          <p className="et-panel__muted">
            Drift test ({Math.round(drift.durationS)}s): offset went from{' '}
            {describeOffset(drift.start)} to {describeOffset(drift.end)}. Export data to analyse.
          </p>
        )}
        <div className="et-panel__row">
          {headPointerAvailable && (
            <button onClick={() => tracker.setPointerMode(eyes ? 'head' : 'eyes')}>
              {eyes ? 'Pointer: eyes' : 'Pointer: head'}
            </button>
          )}
          {eyes ? (
            <button onClick={() => setCalibrating(true)} disabled={status !== 'running'}>
              {calibrated ? 'Recalibrate' : 'Calibrate'}
            </button>
          ) : (
            <>
              <button
                onClick={() => setCentering(true)}
                disabled={status !== 'running' || !faceDetected}
              >
                Center
              </button>
              <label className="et-panel__slider">
                Sensitivity {headPointer.sensitivity.toFixed(1)}×
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.1}
                  value={headPointer.sensitivity}
                  onChange={(e) => tracker.setHeadPointer({ sensitivity: Number(e.target.value) })}
                />
              </label>
            </>
          )}
          <button onClick={() => setShowCamera((v) => !v)}>
            {showCamera ? 'Hide camera' : 'Show camera'}
          </button>
          <button onClick={() => setShowCursor((v) => !v)} disabled={!pointing}>
            {showCursor ? 'Hide pointer dot' : 'Show pointer dot'}
          </button>
          <button
            onClick={() => tracker.setAimAssist({ enabled: !aimAssist.enabled })}
            disabled={!pointing}
          >
            {aimAssist.enabled ? 'Aim assist: on' : 'Aim assist: off'}
          </button>
          {aimAssist.enabled && pointing && (
            <label className="et-panel__slider">
              Pull
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={aimAssist.strength}
                onChange={(e) => tracker.setAimAssist({ strength: Number(e.target.value) })}
              />
            </label>
          )}
          {status === 'error' && <button onClick={() => tracker.start()}>Retry camera</button>}
        </div>
        {pointing && (
          <div className="et-panel__row">
            <button onClick={() => tracker.setDwell({ enabled: !dwell.enabled })}>
              {dwell.enabled ? 'Dwell select: on' : 'Dwell select: off'}
            </button>
            {dwell.enabled && (
              <label className="et-panel__slider">
                Dwell {(dwell.durationMs / 1000).toFixed(1)}s
                <input
                  type="range"
                  min={400}
                  max={2500}
                  step={100}
                  value={dwell.durationMs}
                  onChange={(e) => tracker.setDwell({ durationMs: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
        )}
        {eyes && calibrated && (
          <div className="et-panel__row">
            <button onClick={() => setLearnFromClicks((v) => !v)} disabled={!canRefine}>
              {learnFromClicks ? 'Learn from clicks: on' : 'Learn from clicks: off'}
            </button>
            <button onClick={() => tracker.setDwell({ learn: !dwell.learn })} disabled={!canRefine}>
              {dwell.learn ? 'Learn from selections: on' : 'Learn from selections: off'}
            </button>
            {canRefine ? (
              <span className="et-panel__muted">
                Learned from {learnedClicks} clicks, {learnedSelections} selections
              </span>
            ) : (
              <span className="et-panel__muted">Recalibrate once to enable learning</span>
            )}
            {canRefine && (
              <button onClick={() => setDriftTesting(true)} disabled={status !== 'running'}>
                Drift test (40s)
              </button>
            )}
            {canRefine && <button onClick={() => downloadCalibration(tracker)}>Export data</button>}
            {learnedClicks + learnedSelections > 0 && (
              <button onClick={() => tracker.clearLearned()}>Forget learning</button>
            )}
          </div>
        )}
        {eyes && calibrated && status === 'running' && faceDetected && <HeadPositionGuide />}
        {!eyes && !headCentered && (
          <p className="et-panel__muted">Click Center and point your nose at the dot to start.</p>
        )}
        {showCamera && <CameraPreview />}
      </div>
      {pointing && showCursor && !overlayOpen && <GazeCursor />}
      {eyes && calibrated && canRefine && learnFromClicks && !overlayOpen && <ClickRefinement />}
      {eyes && calibrated && !overlayOpen && <LearningFeedback />}
      {showCentering && <HeadCenterOverlay onDone={handleCentered} onCancel={handleCenterCancel} />}
      {driftTesting && (
        <DriftTestOverlay onComplete={handleDriftComplete} onCancel={handleDriftCancel} />
      )}
      {calibrating && <CalibrationOverlay onComplete={handleComplete} onCancel={handleCancel} />}
    </>
  )
}
