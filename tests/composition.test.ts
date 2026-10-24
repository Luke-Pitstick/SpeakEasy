import { describe, expect, it } from 'vitest'
import type { PredictionPurpose, PredictionRequest } from '../src/shared/prediction'
import {
  entrySeed,
  initialState,
  reducer,
  type CompositionState
} from '../src/renderer/src/composition/model'
import { DemoPhrasePredictor, validateResult } from '../src/renderer/src/prediction/demo'

function requestFor(
  state: CompositionState,
  purpose: PredictionPurpose = 'expansion',
  id = 'request-1'
): PredictionRequest {
  return {
    id,
    revision: state.revision,
    purpose,
    tokens: state.tokens,
    draft: state.draft,
    target: state.selection ?? { start: state.draft.length, end: state.draft.length }
  }
}
async function suggest(
  state: CompositionState,
  purpose: PredictionPurpose = 'expansion'
): Promise<CompositionState> {
  const request = requestFor(state, purpose)
  const pending = reducer(state, { type: 'request', request })
  const result = await new DemoPhrasePredictor('normal', 0).predict(
    request,
    new AbortController().signal
  )
  return reducer(pending, { type: 'result', result })
}
const example = (): CompositionState =>
  reducer(initialState(), { type: 'example', initials: 'iwac' })

describe('shared composition', () => {
  it('expands initials without changing text until explicit acceptance', async () => {
    const choices = await suggest(example())
    expect(choices.candidates).toHaveLength(4)
    expect(choices.draft).toBe('')
    const accepted = reducer(choices, { type: 'accept', id: choices.candidates[0].id })
    expect(accepted.draft).toBe('I want a coffee')
    expect(accepted.tokens.map((token) => token.value).join('')).toBe('iwac')
    expect(reducer(accepted, { type: 'accept', id: choices.candidates[0].id })).toBe(accepted)
    expect(reducer(accepted, { type: 'undo' }).draft).toBe('')
    expect(reducer(accepted, { type: 'back' }).tokens).toEqual(choices.tokens)
  })
  it('accepts reversible Dasher snapshots in one undo transaction and rejects old sessions', () => {
    let state = reducer(initialState(), { type: 'resume' })
    const id = state.session.id
    state = reducer(state, { type: 'engine', sessionId: id, sequence: 0, text: 'iwa' })
    state = reducer(state, { type: 'engine', sessionId: id, sequence: 1, text: 'iwac' })
    state = reducer(state, { type: 'engine', sessionId: id, sequence: 2, text: 'iwa' })
    expect(entrySeed(state)).toBe('iwa')
    expect(state.history).toHaveLength(1)
    expect(reducer(state, { type: 'engine', sessionId: id, sequence: 1, text: 'bad' })).toBe(state)
    const undone = reducer(state, { type: 'undo' })
    expect(entrySeed(undone)).toBe('')
    expect(undone.revision).toBeGreaterThan(state.revision)
    expect(reducer(undone, { type: 'engine', sessionId: id, sequence: 3, text: 'late' })).toBe(
      undone
    )
  })
  it('discards late results after edits, undo, cancellation, and retry', async () => {
    let state = example()
    const request = requestFor(state)
    const response = await new DemoPhrasePredictor('normal', 0).predict(
      request,
      new AbortController().signal
    )
    state = reducer(state, { type: 'request', request })
    const edited = reducer(state, { type: 'input', text: 'insw' })
    const undone = reducer(edited, { type: 'undo' })
    const cancelled = reducer(state, { type: 'dismiss' })
    const retry = reducer(state, { type: 'request', request: { ...request, id: 'request-2' } })
    for (const next of [edited, undone, cancelled, retry])
      expect(reducer(next, { type: 'result', result: response })).toBe(next)
  })
  it('locks one word, preserves original initials, and filters incompatible choices', async () => {
    let state = reducer(example(), { type: 'select-token', id: 'initial-3' })
    state = reducer(state, { type: 'spell' })
    state = reducer(state, { type: 'input', text: 'coffee' })
    state = reducer(state, { type: 'done' })
    expect(state.tokens.at(-1)).toMatchObject({ kind: 'word', value: 'coffee' })
    const choices = await suggest(state)
    expect(choices.candidates.map((candidate) => candidate.text)).toEqual(['I want a coffee'])
    expect(reducer(choices, { type: 'dismiss' }).tokens).toEqual(state.tokens)
  })
  it('keeps accepted text and punctuation intact when spelling or canceling a selected word', () => {
    let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
    state = reducer(state, { type: 'input', text: 'Hello, Alex!' })
    state = reducer(state, { type: 'select-span', range: { start: 7, end: 11 } })
    state = reducer(state, { type: 'spell' })
    const edited = reducer(state, { type: 'input', text: 'Zephyr' })
    expect(edited.draft).toBe('Hello, Alex!')
    expect(reducer(edited, { type: 'cancel-edit' }).draft).toBe('Hello, Alex!')
    const done = reducer(edited, { type: 'done' })
    expect(done.draft).toBe('Hello, Zephyr!')
    expect(reducer(done, { type: 'undo' }).draft).toBe('Hello, Alex!')
  })
  it('refines only the selected range and completes literal text', async () => {
    let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
    state = reducer(state, { type: 'input', text: 'I want a coffee!' })
    state = reducer(state, { type: 'select-span', range: { start: 9, end: 15 } })
    const refined = await suggest(state, 'refinement')
    expect(refined.candidates[1].text).toBe('I want a tea!')
    state = reducer(state, { type: 'input', text: 'I want a co' })
    const completed = await suggest(state, 'completion')
    expect(completed.candidates.map((candidate) => candidate.text)).toEqual([
      'I want a coffee',
      'I want a cookie'
    ])
  })
  it('pauses input without losing either buffer and never reinterprets initials as literal text', () => {
    let state = reducer(example(), { type: 'mode', mode: 'literal' })
    expect(state.draft).toBe('')
    state = reducer(state, { type: 'input', text: 'Exact message' })
    state = reducer(state, { type: 'mode', mode: 'initials' })
    state = reducer(state, { type: 'resume' })
    const paused = reducer(state, { type: 'pause' })
    expect(paused.draft).toBe('Exact message')
    expect(entrySeed(paused)).toBe('iwac')
    expect(
      reducer(paused, { type: 'engine', sessionId: paused.session.id, sequence: 0, text: 'bad' })
    ).toBe(paused)
  })
})

describe('provider boundary', () => {
  it('returns honest empty results for unknown initials', async () => {
    const state = reducer(initialState(), { type: 'input', text: 'xyzq' })
    expect((await suggest(state)).status).toBe('empty')
  })
  it('rejects malformed, mismatched, and constraint-breaking responses', () => {
    const request = requestFor(example())
    const base = {
      requestId: request.id,
      revision: request.revision,
      purpose: request.purpose,
      provider: 'demo',
      status: 'success',
      candidates: [{ replacement: 'unrelated phrase' }]
    }
    expect(validateResult(request, base).status).toBe('error')
    expect(validateResult(request, { ...base, revision: 999 }).status).toBe('error')
    expect(validateResult(request, null).status).toBe('error')
    const result = validateResult(request, {
      ...base,
      candidates: [
        { replacement: 'I want a coffee', text: 'MALICIOUS FULL DRAFT' },
        { replacement: 'I want a coffee' }
      ]
    })
    expect(result.status).toBe('success')
    if (result.status === 'success')
      expect(result.candidates.map((candidate) => candidate.text)).toEqual(['I want a coffee'])
  })
  it('cancels asynchronous generation and reports explicit errors', async () => {
    const request = requestFor(example())
    const controller = new AbortController()
    const promise = new DemoPhrasePredictor('normal', 100).predict(request, controller.signal)
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    const error = await new DemoPhrasePredictor('error', 0).predict(
      request,
      new AbortController().signal
    )
    expect(error.status).toBe('error')
  })
})

it('keeps a spelling destination fixed until the edit is accepted or canceled', () => {
  let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: 'I want coffee' })
  state = reducer(state, { type: 'select-span', range: { start: 7, end: 13 } })
  state = reducer(state, { type: 'spell' })
  state = reducer(state, { type: 'input', text: 'tea' })
  expect(reducer(state, { type: 'select-span', range: { start: 0, end: 1 } })).toBe(state)
  expect(reducer(state, { type: 'done' }).draft).toBe('I want tea')
})

it('allows a locked token to be changed back to an initial or deleted', () => {
  let state = reducer(example(), { type: 'select-token', id: 'initial-3' })
  state = reducer(state, { type: 'spell' })
  state = reducer(state, { type: 'input', text: 'coffee' })
  state = reducer(state, { type: 'done' })
  expect(
    reducer(state, { type: 'backspace' })
      .tokens.map((token) => token.value)
      .join('')
  ).toBe('iwa')
  state = reducer(state, { type: 'select-token', id: 'initial-3' })
  state = reducer(state, { type: 'spell' })
  state = reducer(state, { type: 'input', text: 't' })
  state = reducer(state, { type: 'use-initial' })
  expect(state.tokens.at(-1)).toMatchObject({ kind: 'initial', value: 't' })
  expect(entrySeed(state)).toBe('iwat')
})

it('returns visible validation feedback instead of silently ignoring an invalid keyword', () => {
  let state = reducer(example(), { type: 'select-token', id: 'initial-3' })
  state = reducer(state, { type: 'spell' })
  state = reducer(state, { type: 'input', text: 'hot coffee' })
  expect(reducer(state, { type: 'done' }).validationError).toBe(
    'A locked keyword must be one word.'
  )
})
