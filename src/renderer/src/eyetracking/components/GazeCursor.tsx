import { useEffect, useRef } from 'react'
import { useGazeTracker } from '../hooks'

/** A dot that follows the user's gaze. Updates the DOM directly to avoid per-frame renders. */
export function GazeCursor(): React.JSX.Element {
  const tracker = useGazeTracker()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(
    () =>
      tracker.onGaze((gaze) => {
        const el = ref.current
        if (!el) return
        el.style.transform = `translate(${gaze.x}px, ${gaze.y}px)`
        el.classList.toggle('gaze-cursor--blink', gaze.blinking)
        el.classList.add('gaze-cursor--visible')
      }),
    [tracker]
  )

  return <div ref={ref} className="gaze-cursor" aria-hidden />
}
