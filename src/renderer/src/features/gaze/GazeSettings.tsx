import { useTrackerState, useGazeTracker } from '../../eyetracking/hooks'
import { ActionButton } from '../../interaction/controls'
import type { InputSource } from './input'

interface Props {
  input: InputSource
  onInput: (input: InputSource) => void
  onCalibrate: () => void
  onCenter: () => void
  showDot: boolean
  onShowDot: (show: boolean) => void
}

/** Settings-menu controls for eye tracking: input source, calibration/centring, pointer dot. */
export function GazeSettings({
  input,
  onInput,
  onCalibrate,
  onCenter,
  showDot,
  onShowDot
}: Props): React.JSX.Element {
  const tracker = useGazeTracker()
  const { status, error, faceDetected, calibrated, headPointerAvailable, headPointer } =
    useTrackerState()
  const running = status === 'running'
  return (
    <>
      <label>
        Input
        <select value={input} onChange={(event) => onInput(event.target.value as InputSource)}>
          <option value="mouse">Mouse</option>
          <option value="eyes">Eye tracker (webcam)</option>
          {(headPointerAvailable || input === 'head') && (
            <option value="head">Head pointer (webcam)</option>
          )}
        </select>
      </label>
      {input === 'eyes' && (
        <ActionButton
          className="settings-action"
          identity={`calibrate-${running}-${calibrated}`}
          disabled={!running}
          onAction={onCalibrate}
        >
          {calibrated ? 'Recalibrate eye tracker' : 'Calibrate eye tracker'}
        </ActionButton>
      )}
      {input === 'head' && (
        <ActionButton
          className="settings-action"
          identity={`center-${running}-${faceDetected}`}
          disabled={!running || !faceDetected}
          onAction={onCenter}
        >
          Center head pointer
        </ActionButton>
      )}
      {input === 'head' && (
        <label>
          Head pointer sensitivity
          <select
            value={headPointer.sensitivity}
            onChange={(event) =>
              tracker.setHeadPointer({ sensitivity: Number(event.target.value) })
            }
          >
            <option value={0.7}>Low</option>
            <option value={1}>Standard</option>
            <option value={1.4}>High</option>
            <option value={2}>Very high</option>
          </select>
        </label>
      )}
      {input !== 'mouse' && (
        <label>
          Pointer dot
          <select
            value={String(showDot)}
            onChange={(event) => onShowDot(event.target.value === 'true')}
          >
            <option value="true">Shown</option>
            <option value="false">Hidden</option>
          </select>
        </label>
      )}
      {input !== 'mouse' && (
        <p className="settings-note" role="status">
          {error
            ? `Camera: ${error}`
            : !running
              ? 'Starting camera…'
              : !faceDetected
                ? 'No face detected. Sit facing the camera.'
                : input === 'eyes'
                  ? calibrated
                    ? 'Eye tracker calibrated and driving the pointer.'
                    : 'Calibrate to start using your eyes. The mouse works until then.'
                  : 'Head pointer active. Point your nose to move; center again if it drifts.'}
        </p>
      )}
    </>
  )
}
