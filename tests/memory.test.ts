import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { MemoryStore, retrieveMemories } from '../src/main/memory'
import { correctedWords, memoryVocabulary, type CorrectionMemory } from '../src/shared/memory'
import { predictionMessages } from '../src/main/gemini'
import { initialState, reducer, type CompositionState } from '../src/renderer/src/composition/model'
import { candidateFor } from '../src/shared/predictionValidation'
import type { PredictionRequest } from '../src/shared/prediction'

const paths: string[] = []
afterEach(() => {
  for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true })
})
const correction = { before: 'I want to see Andrew', after: 'I want to see Anjali' }
function request(initials = 'c w c a'): PredictionRequest {
  return {
    id: 'test',
    revision: 1,
    purpose: 'expansion',
    draft: '',
    target: { start: 0, end: 0 },
    conversation: [],
    tokens: initials.split(' ').map((value, i) => ({
      id: String(i),
      kind: value.length === 1 ? 'initial' : 'prefix',
      value
    }))
  }
}
function record(id: string, after: string, createdAt = Date.now()): CorrectionMemory {
  return { id, before: correction.before, after, createdAt }
}
function preview(): CompositionState {
  let state = reducer(initialState(), { type: 'example', initials: 'iwtsa' })
  state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'test' })
  state = reducer(state, {
    type: 'result',
    result: {
      requestId: 'test',
      revision: state.revision,
      purpose: 'expansion',
      provider: 'gemini',
      elapsedMs: 0,
      status: 'success',
      complete: true,
      candidates: [candidateFor(state.request!, correction.before, 0)!]
    }
  })
  return reducer(state, { type: 'edit-candidate', id: state.candidates[0].id })
}

describe('correction commits', () => {
  it('learns only a committed corrected preview and retracts it on undo', () => {
    let state = preview()
    expect(state.memoryEvents).toEqual([])
    state = reducer(state, { type: 'input', text: correction.after })
    expect(state.memoryEvents).toEqual([])
    state = reducer(state, { type: 'use-phrase' })
    expect(state.memoryEvents.at(-1)?.operation).toMatchObject({ type: 'learn', correction })
    const committed = state.memoryEvents.at(-1)!.operation
    state = reducer(state, { type: 'memory-changed' })
    state = reducer(state, { type: 'undo' })
    expect(state.memoryEvents.at(-1)?.operation).toEqual({
      type: 'forget',
      ids: committed.type === 'learn' ? [committed.id] : []
    })
  })
  it('does not learn unchanged suggestions, abandoned edits, or raw input', () => {
    expect(reducer(preview(), { type: 'use-phrase' }).memoryEvents).toEqual([])
    let state = reducer(preview(), { type: 'input', text: correction.after })
    state = reducer(state, { type: 'back' })
    expect(state.memoryEvents).toEqual([])
    expect(reducer(initialState(), { type: 'input', text: 'anjali' }).memoryEvents).toEqual([])
  })
  it('learns a committed replacement in a draft but waits for preview confirmation', () => {
    for (const committed of [true, false]) {
      let state = preview()
      if (committed) state = reducer(state, { type: 'use-phrase' })
      state = reducer(state, { type: 'select-span', range: { start: 14, end: 20 } })
      state = reducer(state, { type: 'spell' })
      state = reducer(state, { type: 'input', text: 'Anjali' })
      state = reducer(state, { type: 'done' })
      if (committed)
        expect(state.memoryEvents.at(-1)?.operation).toMatchObject({ type: 'learn', correction })
      else expect(state.memoryEvents).toEqual([])
    }
  })
  it('rejects staged predictions after memory changes', () => {
    let state = reducer(initialState(), { type: 'example', initials: 'iwtsa' })
    state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'stale' })
    const old = state.request!
    state = reducer(state, { type: 'memory-changed' })
    expect(
      reducer(state, {
        type: 'result',
        result: {
          requestId: old.id,
          revision: old.revision,
          purpose: 'expansion',
          provider: 'gemini',
          elapsedMs: 0,
          status: 'success',
          complete: true,
          candidates: [candidateFor(old, correction.after, 0)!]
        }
      })
    ).toBe(state)
  })
})

describe('personal memory', () => {
  it('groups spelling variants and counts each correction only once', () => {
    const records = [record('one', 'Anjali ANJALI', 1), record('two', 'I want to see anjali', 2)]
    expect(memoryVocabulary(records, [])).toEqual([
      { key: 'anjali', word: 'anjali', corrections: 2, lastCorrected: 2 }
    ])
    expect(memoryVocabulary(records, ['anjali'])).toEqual([])
  })
  it('forgets a word across all examples after restart without losing other vocabulary', () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-word-memory-'))
    paths.push(folder)
    const path = join(folder, 'memory.sqlite')
    let store = new MemoryStore(path)
    store.update({ type: 'settings', learning: true, cloud: true })
    store.update({
      type: 'learn',
      id: 'one',
      correction: { before: 'Call Andrew today', after: 'Call Anjali tomorrow' }
    })
    store.update({
      type: 'learn',
      id: 'two',
      correction: { before: 'Call ANJALI today', after: 'Call ANJALI soon' }
    })
    store.update({ type: 'forget-word', word: 'ANJALI' })
    store.close()
    store = new MemoryStore(path)
    expect(store.read().records).toHaveLength(2)
    expect(
      memoryVocabulary(store.read().records, store.read().forgottenWords).map((entry) => entry.word)
    ).toEqual(['soon', 'tomorrow'])
    const input = request('c a t')
    input.conversation = [{ id: 'p', speaker: 'partner', text: 'Call Anjali tomorrow' }]
    expect(store.retrieve(input)).toEqual({ vocabulary: ['tomorrow'], examples: [] })
    // Replaying an old receipt or editing a different word must not restore it.
    store.update({
      type: 'learn',
      id: 'one',
      correction: { before: 'Call Andrew today', after: 'Call Anjali tomorrow' }
    })
    store.update({
      type: 'learn',
      id: 'three',
      correction: { before: 'Call Anjali tomorrow', after: 'Call Anjali tonight' }
    })
    expect(store.read().forgottenWords).toEqual(['anjali'])
    store.update({
      type: 'learn',
      id: 'four',
      correction: { before: 'Call Andrew', after: 'Call Anjali' }
    })
    expect(store.read().forgottenWords).toEqual([])
    expect(store.retrieve(input).vocabulary).toContain('Anjali')
    store.update({ type: 'forget-word', word: 'Anjali' })
    store.update({ type: 'clear' })
    expect(store.read().forgottenWords).toEqual([])
    expect(store.read().records).toEqual([])
    store.close()
  })
  it('preserves changed spelling without learning shifted neighboring words', () => {
    expect(correctedWords(correction)).toEqual(['Anjali'])
    expect(correctedWords({ before: 'Call anjali', after: 'Call Anjali' })).toEqual(['Anjali'])
    expect(
      correctedWords({
        before: 'Please call Andrew today',
        after: 'Please call Anjali tomorrow morning'
      })
    ).toEqual(['Anjali', 'tomorrow', 'morning'])
    expect(correctedWords({ before: 'I want tea', after: 'I really want tea' })).toEqual(['really'])
  })
  it('persists opt-in records across restart and removes derived retrieval after editing and forgetting', () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-memory-'))
    paths.push(folder)
    const path = join(folder, 'memory.sqlite')
    let store = new MemoryStore(path)
    store.update({ type: 'learn', id: 'disabled', correction })
    expect(store.read().records).toEqual([])
    store.update({ type: 'settings', learning: true, cloud: false })
    store.update({ type: 'learn', id: 'one', correction })
    store.update({ type: 'learn', id: 'one', correction })
    expect(store.read().records).toHaveLength(1)
    expect(store.retrieve(request()).vocabulary).toEqual([])
    store.close()
    store = new MemoryStore(path)
    store.update({ type: 'settings', learning: true, cloud: true })
    expect(store.retrieve(request()).vocabulary).toContain('Anjali')
    store.update({ type: 'edit', id: 'one', text: 'I want to see Amara' })
    expect(store.retrieve(request()).vocabulary).toEqual(['Amara'])
    store.update({ type: 'forget', ids: ['one'] })
    expect(store.retrieve(request())).toEqual({ vocabulary: [], examples: [] })
    store.close()
    store = new MemoryStore(path)
    expect(store.read().records).toEqual([])
    store.update({ type: 'learn', id: 'two', correction })
    store.update({ type: 'clear' })
    expect(store.retrieve(request()).vocabulary).toEqual([])
    store.close()
  })
  it('ranks prefixes and context above frequency, and uses words with new initials', () => {
    const records = Array.from({ length: 30 }, (_, i) => record(String(i), 'I want to see Alice'))
    records.push(record('new', correction.after))
    expect(retrieveMemories(records, request('c w c anj')).vocabulary).toEqual(['Anjali'])
    const input = request()
    input.conversation = [{ id: 'partner', speaker: 'partner', text: 'Anjali is visiting today' }]
    expect(retrieveMemories(records, input).vocabulary[0]).toBe('Anjali')
    expect(
      retrieveMemories(records, request('i w t s a')).examples.some(
        (e) => e.text === correction.after
      )
    ).toBe(true)
    expect(retrieveMemories(records, request('i w t')).vocabulary).toEqual([])
  })
  it('reserves a new eligible word, bounds context and ignores unrelated examples', () => {
    const records = Array.from({ length: 20 }, (_, i) =>
      record(String(i), 'I want to see Aname' + i, 1)
    )
    records.push(record('newest', correction.after, Date.now()))
    const memory = retrieveMemories(records, request())
    expect(memory.vocabulary).toContain('Anjali')
    expect(memory.vocabulary.length).toBeLessThanOrEqual(8)
    expect(memory.examples).toEqual([])
    expect(JSON.stringify(memory).length).toBeLessThanOrEqual(1800)
    const messages = predictionMessages(request(), memory)
    expect(JSON.parse(messages[1].content).personalMemory.vocabulary).toContain('Anjali')
    expect(messages[0].content).toContain('Current constraints override memory')
  })
})
