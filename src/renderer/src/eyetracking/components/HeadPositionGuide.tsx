import { useEffect, useRef } from 'react'
import { useGazeTracker } from '../hooks'

// Box covers +/-RANGE_CM around the calibration position; outside TOLERANCE accuracy drops.
const RANGE_CM = 12
const TOLERANCE_CM = 4
const DEPTH_TOLERANCE = 0.15

/**
 * Shows where the head is relative to where it was during calibration (ring), mirrored like
 * the camera preview, with a hint for getting back. Updates the DOM directly each frame.
 */
export function HeadPositionGuide(): React.JSX.Element {
  const tracker = useGazeTracker()
  const dotRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLSpanElement>(null)

  useEffect(
    () =>
      tracker.onHead((head) => {
        const ref = tracker.calibrationReference
        const dot = dotRef.current
        const hint = hintRef.current
        if (!ref || !dot || !hint) return
        // Camera +x is the user's left and +y is up; flip both to match a mirror view.
        const dx = -(head.eye[0] - ref[0])
        const dy = -(head.eye[1] - ref[1])
        const depth = head.eye[2] / ref[2]
        const clamp = (v: number): number => Math.max(-1, Math.min(1, v / RANGE_CM))
        dot.style.left = `${50 + 50 * clamp(dx)}%`
        dot.style.top = `${50 + 50 * clamp(dy)}%`
        dot.style.transform = `translate(-50%, -50%) scale(${Math.min(2, Math.max(0.5, 1 / depth))})`

        const tips: string[] = []
        if (dx > TOLERANCE_CM) tips.push('left')
        if (dx < -TOLERANCE_CM) tips.push('right')
        if (dy > TOLERANCE_CM) tips.push('up')
        if (dy < -TOLERANCE_CM) tips.push('down')
        if (depth > 1 + DEPTH_TOLERANCE) tips.push('closer')
        if (depth < 1 - DEPTH_TOLERANCE) tips.push('back')
        const text = tips.length ? `Move ${tips.join(', ')}` : 'Good position'
        if (hint.textContent !== text) hint.textContent = text
        dot.classList.toggle('head-guide__dot--off', tips.length > 0)
      }),
    [tracker]
  )

  return (
    <div className="head-guide">
      <div className="head-guide__box">
        <div className="head-guide__ring" />
        <div ref={dotRef} className="head-guide__dot" />
      </div>
      <span ref={hintRef} className="et-panel__muted" />
    </div>
  )
}
