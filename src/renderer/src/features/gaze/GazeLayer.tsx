import { useCallback, useEffect, useState } from 'react'
import { useCompositionDispatch } from '../../composition/state'
import { CalibrationOverlay } from '../../eyetracking/components/CalibrationOverlay'
import { GazeCursor } from '../../eyetracking/components/GazeCursor'
import { HeadCenterOverlay } from '../../eyetracking/components/HeadCenterOverlay'
import { GazePointerBridge } from '../../eyetracking/gazePointerBridge'
import { useGazeTracker, useTrackerState } from '../../eyetracking/hooks'
import type { InputSource } from './input'

export type GazeOverlay = 'none' | 'calibrate' | 'center'

interface Props {
  input: InputSource
  overlay: GazeOverlay
  /** Must be stable (useCallback): the calibration screen restarts if it changes. */
  onOverlayDone: () => void
  showDot: boolean
}

/**
 * Connects the eye tracker (or head pointer) to the workspace: once calibrated (or centred), gaze
 * drives the ordinary pointer events the workspace already uses. Also hosts the calibration and
 * centring screens and the pointer dot, and pauses writing when tracking is lost.
 */
export function GazeLayer({ input, overlay, onOverlayDone, showDot }: Props): React.JSX.Element {
  const tracker = useGazeTracker()
  const dispatch = useCompositionDispatch()
  const { calibrated, headCentered, faceDetected, status } = useTrackerState()
  const active = input !== 'mouse'
  const pointing = input === 'eyes' ? calibrated : input === 'head' && headCentered
  // Head pointing needs centring once per session; do it as soon as the face is visible. If the
  // user cancels that, don't reopen it on its own (Center in Settings is still there).
  const [autoCenterDismissed, setAutoCenterDismissed] = useState(false)
  const autoCenter =
    input === 'head' &&
    !headCentered &&
    !autoCenterDismissed &&
    status === 'running' &&
    faceDetected
  const cancelCenter = useCallback(() => {
    setAutoCenterDismissed(true)
    onOverlayDone()
  }, [onOverlayDone])
  const shown: GazeOverlay = overlay !== 'none' ? overlay : autoCenter ? 'center' : 'none'
  const driving = active && pointing && shown === 'none'

  useEffect(() => {
    if (active) tracker.setPointerMode(input === 'head' ? 'head' : 'eyes')
  }, [tracker, input, active])

  useEffect(() => {
    if (!driving) return
    const bridge = new GazePointerBridge(tracker)
    bridge.start()
    return () => bridge.stop()
  }, [tracker, driving])

  // Tracking loss pauses writing; resuming is a deliberate action.
  useEffect(() => {
    if (driving && !faceDetected) {
      dispatch({
        type: 'pause',
        notice: 'Eye tracking lost. Paused until you look at the crosshair or start writing again.'
      })
    }
  }, [driving, faceDetected, dispatch])

  return (
    <>
      {driving && showDot && <GazeCursor />}
      {shown === 'calibrate' && (
        <CalibrationOverlay onComplete={onOverlayDone} onCancel={onOverlayDone} />
      )}
      {shown === 'center' && <HeadCenterOverlay onDone={onOverlayDone} onCancel={cancelCenter} />}
    </>
  )
}
