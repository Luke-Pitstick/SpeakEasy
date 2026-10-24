import { useEffect } from 'react'
import { useGazeTracker } from '../hooks'

/**
 * While mounted, every left click teaches the tracker that the user was looking at the click
 * point. Pair with <LearningFeedback /> to see the outcome.
 */
export function ClickRefinement(): null {
  const tracker = useGazeTracker()

  useEffect(() => {
    const onPointerDown = (e: PointerEvent): void => {
      if (e.button !== 0) return
      tracker.refineFromClick(e.clientX, e.clientY, performance.now())
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [tracker])

  return null
}
