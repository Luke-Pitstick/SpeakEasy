import { useEffect, useState } from 'react'
import type { CalibrationSample } from '../GazeTracker'
import { useGazeTracker } from '../hooks'
import type { CalibrationResult } from '../types'

// Fractions of the window. Training points cover the edges; validation points sit between
// them so accuracy is measured on positions the model never saw.
const TRAIN_POINTS: [number, number][] = [
  [0.5, 0.5],
  [0.08, 0.08],
  [0.5, 0.08],
  [0.92, 0.08],
  [0.92, 0.5],
  [0.92, 0.92],
  [0.5, 0.92],
  [0.08, 0.92],
  [0.08, 0.5]
]
const VALIDATION_POINTS: [number, number][] = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.7, 0.7],
  [0.3, 0.7]
]
const SETTLE_MS = 800
const COLLECT_MS = 1200

interface Props {
  onComplete: (result: CalibrationResult) => void
  onCancel: () => void
}

/** Full-window calibration: the user follows a dot while eye samples are recorded. */
export function CalibrationOverlay({ onComplete, onCancel }: Props): React.JSX.Element {
  const tracker = useGazeTracker()
  const [point, setPoint] = useState<{ pos: [number, number]; collecting: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

    const record = async (points: [number, number][]): Promise<CalibrationSample[]> => {
      const all: CalibrationSample[] = []
      for (const pos of points) {
        if (cancelled) break
        setPoint({ pos, collecting: false })
        await wait(SETTLE_MS)
        if (cancelled) break
        setPoint({ pos, collecting: true })
        const x = pos[0] * window.innerWidth
        const y = pos[1] * window.innerHeight
        all.push(...(await tracker.collectSamples(x, y, COLLECT_MS)))
      }
      return all
    }

    ;(async () => {
      await wait(1000)
      const train = await record(TRAIN_POINTS)
      const validation = await record(VALIDATION_POINTS)
      if (cancelled) return
      try {
        tracker.calibrate(train)
        const result = tracker.evaluate(validation)
        // Accuracy is reported from held-out points; the final model then uses all data.
        tracker.calibrate([...train, ...validation])
        onComplete(result)
      } catch (err) {
        setPoint(null)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [tracker, onComplete])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="calibration">
      {error ? (
        <div className="calibration__message">
          <p>{error}</p>
          <button onClick={onCancel}>Close</button>
        </div>
      ) : point ? (
        <div
          className={`calibration__dot${point.collecting ? ' calibration__dot--collecting' : ''}`}
          style={{ left: `${point.pos[0] * 100}%`, top: `${point.pos[1] * 100}%` }}
        />
      ) : (
        <div className="calibration__message">
          <p>Keep your head still and follow the dot with your eyes.</p>
          <p className="calibration__hint">Press Esc to cancel</p>
        </div>
      )}
    </div>
  )
}
