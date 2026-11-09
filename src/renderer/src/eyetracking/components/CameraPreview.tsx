// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

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
