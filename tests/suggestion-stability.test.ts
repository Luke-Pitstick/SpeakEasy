import { describe, expect, it } from 'vitest'
import { initialState, reducer, type CompositionState } from '../src/renderer/src/composition/model'

function readySuggestions(): CompositionState {
  const base = initialState()
  const loading = reducer(base, {
    type: 'request',
    request: {
      id: 'req-1',
      revision: base.revision,
      purpose: 'expansion',
      lockedMessage: '',
      draft: '',
      tokens: [{ id: 'initial-0', kind: 'initial', value: 'h' }],
      target: { start: 0, end: 0 },
      conversation: []
    }
  })
  return reducer(loading, {
    type: 'result',
    result: {
      requestId: 'req-1',
      revision: base.revision,
      purpose: 'expansion',
      provider: 'gemini',
      elapsedMs: 10,
      status: 'success',
      complete: true,
      candidates: [{ id: 'c1', text: 'Hello', replacement: 'Hello' }]
    }
  })
}

describe('displayed suggestions', () => {
  it('stay usable when a conversation turn arrives', () => {
    const ready = readySuggestions()
    const next = reducer(ready, { type: 'conversation-add', speaker: 'partner', text: 'Hi there' })
    expect(next.request).toBe(ready.request)
    expect(next.candidates).toEqual(ready.candidates)
    expect(next.revision).toBe(ready.revision)
    expect(next.conversation.at(-1)?.text).toBe('Hi there')
    const accepted = reducer(next, { type: 'accept', id: 'c1' })
    expect(accepted.draft).toBe('Hello')
  })

  it('give successive turns distinct ids', () => {
    let state = readySuggestions()
    state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: 'One' })
    state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: 'Two' })
    const ids = state.conversation.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('are cleared when memory is invalidated', () => {
    const next = reducer(readySuggestions(), { type: 'memory-changed' })
    expect(next.request).toBeNull()
    expect(next.candidates).toEqual([])
  })
})
