import { useEffect, useRef, useState } from 'react'
import type { GeminiStatus, PredictionPurpose, PredictionResult } from '../../../shared/prediction'
import { validateResult } from '../../../shared/predictionValidation'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { useInteraction } from '../interaction/state'

export function usePredictions(): {
  request: (purpose: PredictionPurpose) => void
  waiting: boolean
  connection: GeminiStatus | null
  connectionError: string
  setEnabled: (enabled: boolean) => Promise<void>
  setModel: (model: string) => Promise<void>
} {
  const state = useComposition(),
    dispatch = useCompositionDispatch(),
    { busy } = useInteraction()
  const [staged, setStaged] = useState<PredictionResult | null>(null)
  const memoryUpdatePending = useRef(false)
  const [memoryVersion, setMemoryVersion] = useState(0)
  const [connection, setConnection] = useState<GeminiStatus | null>(null)
  const [connectionError, setConnectionError] = useState(() =>
    window.gemini ? '' : 'Open the desktop app to connect Gemini.'
  )
  const counter = useRef(0),
    delivered = useRef<PredictionResult | null>(null)
  const pending = state.request
  useEffect(
    () =>
      window.preferences?.onChanged((invalidate, automatic) => {
        if (invalidate && automatic) {
          memoryUpdatePending.current = true
          setStaged(null)
          setMemoryVersion((version) => version + 1)
        }
      }),
    []
  )
  useEffect(() => {
    if (!memoryUpdatePending.current || busy) return
    memoryUpdatePending.current = false
    dispatch({ type: 'memory-learned' })
  }, [memoryVersion, busy, dispatch])
  const setModel = async (model: string): Promise<void> => {
    dispatch({ type: 'dismiss' })
    setStaged(null)
    try {
      if (!window.gemini) throw Error('Desktop bridge unavailable')
      setConnection(await window.gemini.setModel(model))
      setConnectionError('')
    } catch {
      setConnectionError('Could not save the phrase model. Check local storage and retry.')
    }
  }
  useEffect(() => {
    let alive = true
    if (!window.gemini) return
    void window.gemini
      .status()
      .then((value) => {
        if (alive) {
          setConnection(value)
          if (value.enabled) dispatch({ type: 'cloud', enabled: true })
        }
      })
      .catch(() => {
        if (alive) setConnectionError('Could not read Gemini settings. Restart the app.')
      })
    return () => {
      alive = false
    }
  }, [dispatch])
  const setEnabled = async (enabled: boolean): Promise<void> => {
    try {
      if (!window.gemini) throw Error('Desktop bridge unavailable')
      const value = await window.gemini.setEnabled(enabled)
      setConnection(value)
      setConnectionError('')
      dispatch({ type: 'cloud', enabled: value.enabled })
    } catch {
      setConnectionError('Could not change Gemini settings. Restart the app.')
    }
  }
  useEffect(() => {
    if (!pending) return
    let active = true
    const failure = (message: string): void => {
      if (active)
        setStaged({
          requestId: pending.id,
          revision: pending.revision,
          purpose: pending.purpose,
          provider: 'gemini',
          elapsedMs: 0,
          status: 'error',
          message
        })
    }
    const api = window.gemini
    if (!api) {
      failure('Open the desktop app to use Gemini. Exact spelling remains available.')
      return () => {
        active = false
      }
    }
    const unsubscribe = api.onResult((result) => {
      if (active && result.requestId === pending.id && result.revision === pending.revision)
        setStaged(validateResult(pending, result))
    })
    void api.start(pending).catch(() => failure('Could not start Gemini. Retry or keep spelling.'))
    return () => {
      active = false
      unsubscribe()
      api.cancel(pending.id)
    }
  }, [pending])
  useEffect(() => {
    if (staged && !busy && state.paused && delivered.current !== staged) {
      delivered.current = staged
      dispatch({ type: 'result', result: staged })
    }
  }, [staged, busy, state.paused, dispatch])
  const request = (purpose: PredictionPurpose): void =>
    dispatch({ type: 'predict', purpose, id: `prediction-${++counter.current}-${state.revision}` })
  const wasWriting = useRef(false)
  useEffect(() => {
    const justPaused = wasWriting.current && state.paused
    wasWriting.current = !state.paused
    if (
      justPaused &&
      !state.request &&
      state.session.sequence >= 0 &&
      (state.mode === 'initials' || state.mode === 'keyword')
    )
      dispatch({ type: 'predict', purpose: 'expansion', id: `pause-${state.revision}` })
  }, [state.paused, state.mode, state.revision, state.session.sequence, state.request, dispatch])
  return {
    request,
    waiting: !!staged && busy && staged.requestId === pending?.id && state.status === 'loading',
    connection,
    connectionError,
    setEnabled,
    setModel
  }
}
