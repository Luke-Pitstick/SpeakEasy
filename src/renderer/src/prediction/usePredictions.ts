import { useEffect, useRef, useState } from 'react'
import type { DemoScenario, PredictionPurpose, PredictionResult } from '../../../shared/prediction'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { useInteraction } from '../interaction/state'
import { DemoPhrasePredictor, validateResult } from './demo'

export function usePredictions(scenario: DemoScenario): {
  request: (purpose: PredictionPurpose) => void
  waiting: boolean
} {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const { busy } = useInteraction()
  const [staged, setStaged] = useState<PredictionResult | null>(null)
  const counter = useRef(0)
  const delivered = useRef<PredictionResult | null>(null)
  const pending = state.request
  useEffect(() => {
    if (!pending) return
    const controller = new AbortController()
    const provider = new DemoPhrasePredictor(scenario)
    provider
      .predict(pending, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        // A provider may ignore abort. Reducer still validates the request ID and revision.
        setStaged(validateResult(pending, result))
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStaged({
          requestId: pending.id,
          revision: pending.revision,
          purpose: pending.purpose,
          provider: 'demo',
          elapsedMs: 0,
          status: 'error',
          message: 'Suggestions unavailable. Retry or keep spelling.'
        })
      })
    return () => controller.abort()
  }, [pending, scenario])

  useEffect(() => {
    if (staged && !busy && delivered.current !== staged) {
      delivered.current = staged
      dispatch({ type: 'result', result: staged })
    }
  }, [staged, busy, dispatch])

  const request = (purpose: PredictionPurpose): void => {
    if (
      (purpose === 'expansion' && !state.tokens.length) ||
      (purpose === 'refinement' && !state.selection)
    )
      return
    const target =
      purpose === 'refinement'
        ? state.selection!
        : { start: state.draft.length, end: state.draft.length }
    dispatch({
      type: 'request',
      request: {
        id: `prediction-${++counter.current}-${state.revision}`,
        revision: state.revision,
        purpose,
        draft: state.draft,
        tokens: state.tokens.map((token) => ({ ...token })),
        target
      }
    })
  }
  return {
    request,
    waiting: !!staged && busy && staged.requestId === pending?.id && state.status === 'loading'
  }
}
