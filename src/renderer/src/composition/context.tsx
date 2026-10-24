import { useEffect, useReducer, useRef, type ReactNode } from 'react'
import { initialState, reducer } from './model'
import { StateContext, DispatchContext } from './state'
export function CompositionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  useEffect(() => {
    const api = window.gemini
    if (!api || !state.cloudEnabled || !state.summaryPending.length) return
    let alive = true
    const turns = state.summaryPending.slice(0, 8)
    const version = state.summaryVersion
    void api
      .summarize({ summary: state.conversationSummary, turns })
      .then((summary) => {
        if (alive)
          dispatch({ type: 'summary-result', version, ids: turns.map((turn) => turn.id), summary })
      })
      .catch(() => {
        if (alive) dispatch({ type: 'summary-error', version })
      })
    return () => {
      alive = false
      api.cancelSummary()
    }
  }, [state.cloudEnabled, state.summaryPending, state.conversationSummary, state.summaryVersion])
  const namespace = useRef(crypto.randomUUID())
  const processed = useRef(-1)
  const sentencesProcessed = useRef(-1)
  useEffect(
    () =>
      window.preferences?.onChanged((invalidate) => {
        if (invalidate) dispatch({ type: 'memory-changed' })
      }),
    []
  )
  useEffect(() => {
    for (const event of state.sentenceEvents) {
      if (event.sequence <= sentencesProcessed.current) continue
      sentencesProcessed.current = event.sequence
      const op = event.operation
      const operation =
        op.type === 'commit'
          ? { ...op, id: `${namespace.current}:${op.id}` }
          : op.type === 'forget-sentences'
            ? { ...op, ids: op.ids.map((id) => `${namespace.current}:${id}`) }
            : op
      if (window.preferences)
        void window.preferences.update(operation).catch(() => {
          dispatch({
            type: 'memory-notice',
            text: 'Could not save sentence memory. Your draft is intact; review Preferences for storage status.'
          })
        })
    }
  }, [state.sentenceEvents])
  useEffect(() => window.memory?.onChanged(() => dispatch({ type: 'memory-changed' })), [])
  useEffect(() => {
    for (const event of state.memoryEvents) {
      if (event.sequence <= processed.current) continue
      processed.current = event.sequence
      const op = event.operation
      const operation =
        op.type === 'learn'
          ? { ...op, id: `${namespace.current}:${op.id}` }
          : op.type === 'forget'
            ? { ...op, ids: op.ids.map((id) => `${namespace.current}:${id}`) }
            : op
      if (window.memory) {
        void window.memory
          .update(operation)
          .then((saved) => {
            dispatch({
              type: 'memory-notice',
              text:
                saved.error ??
                (saved.learning && op.type === 'learn'
                  ? 'Correction remembered. Manage it in Conversation settings.'
                  : '')
            })
          })
          .catch(() => {
            dispatch({
              type: 'memory-notice',
              text: 'Could not update memory. Your message is still available.'
            })
          })
      }
    }
  }, [state.memoryEvents])
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}
