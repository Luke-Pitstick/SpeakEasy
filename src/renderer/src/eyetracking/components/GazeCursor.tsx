import { useEffect, useRef } from 'react'
import { useGazeTracker } from '../hooks'

/**
 * A dot that follows the user's gaze, filling with a ring while dwelling on a target. The
 * dwelt-on element also gets a `--gaze-dwell` (0..1) CSS variable for its own progress UI.
 * Updates the DOM directly to avoid per-frame renders.
 */
export function GazeCursor(): React.JSX.Element {
  const tracker = useGazeTracker()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const offGaze = tracker.onGaze((gaze) => {
      const el = ref.current
      if (!el) return
      el.style.transform = `translate(${gaze.x}px, ${gaze.y}px)`
      el.classList.toggle('gaze-cursor--blink', gaze.blinking)
      el.classList.toggle('gaze-cursor--locked', gaze.target !== null)
      el.classList.add('gaze-cursor--visible')
    })

    let dwelt: HTMLElement | null = null
    const offDwell = tracker.onDwell(({ target, progress }) => {
      ref.current?.style.setProperty('--dwell', String(progress))
      const el = target
        ? document.querySelector<HTMLElement>(`[data-gaze-target="${CSS.escape(target)}"]`)
        : null
      if (dwelt && dwelt !== el) dwelt.style.removeProperty('--gaze-dwell')
      el?.style.setProperty('--gaze-dwell', String(progress))
      dwelt = el
    })

    return () => {
      offGaze()
      offDwell()
      dwelt?.style.removeProperty('--gaze-dwell')
    }
  }, [tracker])

  return <div ref={ref} className="gaze-cursor" aria-hidden />
}
