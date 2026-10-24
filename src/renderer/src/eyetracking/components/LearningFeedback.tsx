import { useEffect, useState } from 'react'
import type { LearningResult } from '../GazeTracker'
import { useGazeTracker } from '../hooks'

interface Ripple extends LearningResult {
  id: number
}

const RIPPLE_MS = 1600

/**
 * Shows a ring wherever the tracker learned (or declined to learn) from a click or gaze
 * selection: green with the before/after error, grey with the reason.
 */
export function LearningFeedback(): React.JSX.Element {
  const tracker = useGazeTracker()
  const [ripples, setRipples] = useState<Ripple[]>([])

  useEffect(() => {
    let nextId = 0
    return tracker.onLearn((result) => {
      const id = nextId++
      setRipples((r) => [...r, { ...result, id }])
      setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), RIPPLE_MS)
    })
  }, [tracker])

  return (
    <>
      {ripples.map((r) => (
        <div
          key={r.id}
          className={`click-ripple ${r.accepted ? 'click-ripple--learned' : 'click-ripple--skipped'}`}
          style={{ left: r.x, top: r.y }}
        >
          <span className="click-ripple__label">
            {r.accepted
              ? `${r.kind === 'click' ? 'Click' : 'Selection'}: ${Math.round(r.errorBefore!)} → ${Math.round(r.errorAfter!)}px`
              : r.reason}
          </span>
        </div>
      ))}
    </>
  )
}
