import { useEffect, useState } from 'react'
import type { DriftSummary } from '../GazeTracker'
import { useGazeTracker } from '../hooks'

const INTRO_MS = 3000
const DURATION_MS = 40000

interface Props {
  onComplete: (summary: DriftSummary) => void
  onCancel: () => void
}

/**
 * Diagnostic: the user looks at one dot for 40 s while eye and head measurements are
 * recorded with timestamps, to find which signal drifts after calibration. Doesn't change the
 * model; the recording is included in "Export data".
 */
export function DriftTestOverlay({ onComplete, onCancel }: Props): React.JSX.Element {
  const tracker = useGazeTracker()
  const [remaining, setRemaining] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let ticker = 0
    ;(async () => {
      await new Promise((r) => setTimeout(r, INTRO_MS))
      if (cancelled) return
      const end = performance.now() + DURATION_MS
      setRemaining(DURATION_MS / 1000)
      ticker = window.setInterval(
        () => setRemaining(Math.max(0, Math.ceil((end - performance.now()) / 1000))),
        250
      )
      const samples = await tracker.collectSamples(
        window.innerWidth / 2,
        window.innerHeight / 2,
        DURATION_MS,
        'drift'
      )
      clearInterval(ticker)
      if (cancelled) return
      try {
        onComplete(tracker.saveDriftTest(samples))
      } catch (err) {
        setRemaining(null)
        setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
      clearInterval(ticker)
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
      ) : remaining !== null ? (
        <>
          <div className="calibration__dot" style={{ left: '50%', top: '50%' }} />
          <p className="drift-test__countdown">Keep looking at the dot · {remaining}s</p>
        </>
      ) : (
        <div className="calibration__message">
          <p>Sit the way you normally would and look at the dot for 40 seconds.</p>
          <p className="calibration__hint">Blink normally · Esc to cancel</p>
        </div>
      )}
    </div>
  )
}
