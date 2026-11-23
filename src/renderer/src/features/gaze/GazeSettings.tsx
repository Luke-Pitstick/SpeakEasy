// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { CameraPreview } from '../../eyetracking/components/CameraPreview'
import { useTrackerState, useGazeTracker } from '../../eyetracking/hooks'
import { ActionButton } from '../../interaction/controls'
import { DwellSelect, type DwellOption } from '../../interaction/DwellSelect'
import type { InputSource } from './input'

const HEAD_SENSITIVITIES: DwellOption<number>[] = [
  { value: 0.5, label: 'Lowest' },
  { value: 0.7, label: 'Lower' },
  { value: 0.85, label: 'Low' },
  { value: 1, label: 'Standard' },
  { value: 1.2, label: 'High' },
  { value: 1.4, label: 'Higher' },
  { value: 1.7, label: 'Very high' },
  { value: 2, label: 'Highest' }
]

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
  const { status, error, faceDetected, calibrated, headPointer, camera, cameras } =
    useTrackerState()
  const running = status === 'running'
  const webcam = input === 'eyes' || input === 'head'
  return (
    <>
      <label>
        Input
        <select value={input} onChange={(event) => onInput(event.target.value as InputSource)}>
          <option value="mouse">Mouse</option>
          <option value="eyes">Eye tracker (webcam)</option>
          <option value="head">Head pointer (webcam)</option>
          <option value="tobii">Tobii eye tracker (via Talon)</option>
        </select>
      </label>
      {webcam && cameras.length > 1 && (
        <DwellSelect
          label="Camera"
          identity="camera"
          value={camera?.id ?? ''}
          options={cameras.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(id) => tracker.setCamera(id)}
        />
      )}
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
        <DwellSelect
          label="Head pointer sensitivity"
          identity="head-sensitivity"
          value={headPointer.sensitivity}
          options={HEAD_SENSITIVITIES}
          onChange={(value) => tracker.setHeadPointer({ sensitivity: value })}
        />
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
          {input === 'tobii'
            ? error
              ? `Tobii: ${error}`
              : !running
                ? 'Starting Tobii input…'
                : !faceDetected
                  ? 'Waiting for gaze from Talon. Open Talon with your Tobii connected and the SpeakEasy gaze script installed, and look at the screen.'
                  : 'Tobii eye tracker driving the pointer. If it is off, recalibrate in Talon.'
            : error
              ? `Camera: ${error}`
              : !running
                ? 'Starting camera…'
                : !faceDetected
                  ? `No face detected${camera ? ` on ${camera.label}` : ''}. Sit facing the camera, or choose another camera.`
                  : input === 'eyes'
                    ? calibrated
                      ? 'Eye tracker calibrated and driving the pointer.'
                      : 'Calibrate to start using your eyes. The mouse works until then.'
                    : 'Head pointer active. Point your nose to move; center again if it drifts.'}
        </p>
      )}
      {webcam && running && !faceDetected && (
        <div className="settings-preview">
          <CameraPreview />
        </div>
      )}
    </>
  )
}
