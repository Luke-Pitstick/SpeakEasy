import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PhraseCache } from '../src/main/phraseCache'
import { streamGemini } from '../src/main/gemini'
import { candidateFor, validateResult } from '../src/shared/predictionValidation'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'

const folders: string[] = []
function store(): { cache: PhraseCache; path: string } {
  const folder = mkdtempSync(join(tmpdir(), 'speakeasy-cache-'))
  folders.push(folder)
  const path = join(folder, 'phrases.json')
  return { cache: new PhraseCache(path), path }
}
function request(initials = 'iwac'): PredictionRequest {
  return {
    id: 'cache-test',
    revision: 0,
    purpose: 'expansion',
    lockedMessage: '',
    draft: '',
    target: { start: 0, end: 0 },
    tokens: [...initials].map((value, i) => ({ id: String(i), kind: 'initial', value })),
    conversation: []
  }
}
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
describe('spoken phrase cache', () => {
  it('persists corrected text under original and corrected initials, and clears across restarts', () => {
    const { cache, path } = store()
    cache.save('iwac', 'I need some hot tea')
    const reopened = new PhraseCache(path)
    expect(reopened.lookup(request())[0].text).toBe('I need some hot tea')
    expect(reopened.lookup(request('insht'))[0].text).toBe('I need some hot tea')
    reopened.clear()
    expect(new PhraseCache(path).lookup(request())).toEqual([])
  })
  it('ranks exact matches first, then frequency, deduplicates punctuation and limits fuzzy matching', () => {
    const { cache } = store()
    cache.save('iwat', 'I want a tea')
    cache.save('iwac', 'I want a coffee')
    cache.save('iwac', 'I want a cookie')
    cache.save('iwac', 'I want a coffee.')
    expect(cache.lookup(request()).map((c) => c.text)).toEqual([
      'I want a coffee.',
      'I want a cookie',
      'I want a tea'
    ])
    expect(cache.lookup(request('izzz'))).toEqual([])
    cache.save('ic', 'Ice cream')
    expect(cache.lookup(request('it'))).toEqual([])
  })
  it('enforces locked words and prefixes even for original-initial aliases and revalidates in the renderer', () => {
    const { cache } = store()
    cache.save('iwac', 'I want a tea')
    const input = request()
    const candidates = cache.lookup(input)
    expect(
      validateResult(input, {
        requestId: input.id,
        revision: 0,
        purpose: 'expansion',
        provider: 'gemini',
        elapsedMs: 0,
        status: 'success',
        complete: true,
        candidates
      }).status
    ).toBe('success')
    input.tokens[3] = { id: '3', kind: 'prefix', value: 'co' }
    expect(cache.lookup(input)).toEqual([])
    input.tokens[3] = { id: '3', kind: 'word', value: 'coffee' }
    expect(cache.lookup(input)).toEqual([])
    expect(candidateFor(request(), 'I want a tea', 0)).toBeNull()
  })
  it('keeps the original initials through selection, corrections, acceptance and undo', () => {
    let state = reducer(initialState(), { type: 'example', initials: 'iwac' })
    state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'selection' })
    const input = state.request!
    const candidate = candidateFor(input, 'I want a coffee', 0)!
    state = reducer(state, {
      type: 'result',
      result: {
        requestId: input.id,
        revision: input.revision,
        purpose: 'expansion',
        provider: 'gemini',
        elapsedMs: 0,
        status: 'success',
        complete: true,
        candidates: [candidate]
      }
    })
    state = reducer(state, { type: 'edit-candidate', id: candidate.id })
    state = reducer(state, { type: 'input', text: 'I need some hot tea' })
    state = reducer(state, { type: 'use-phrase' })
    expect(state.phraseInitials).toBe('iwac')
    expect(state.draft).toBe('I need some hot tea')
    expect(reducer(reducer(state, { type: 'clear' }), { type: 'undo' }).phraseInitials).toBe('iwac')
  })
})
describe('cache-first generation', () => {
  it('publishes cache before fetching, requests only remaining slots and preserves IDs on append', async () => {
    const { cache } = store(),
      input = request()
    cache.save('iwac', 'I want a coffee')
    cache.save('iwac', 'I want a cookie')
    const cached = cache.lookup(input),
      results: PredictionResult[] = []
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      expect(results[0]).toMatchObject({ status: 'success', complete: false, candidates: cached })
      expect(JSON.parse(String(init?.body)).messages[0].content).toContain('Aim for 4 distinct')
      expect(
        JSON.parse(JSON.parse(String(init?.body)).messages[1].content).alreadyDisplayed
      ).toEqual(cached.map((c) => c.replacement))
      const data = {
        choices: [
          {
            delta: {
              content:
                'I want a coffee\nI want a cat\nI want a coat\nI want a car\nI want a cushion\n'
            },
            finish_reason: 'stop'
          }
        ]
      }
      return new Response(`data: ${JSON.stringify(data)}\n\n`)
    })
    await streamGemini(
      input,
      'test',
      new AbortController().signal,
      (r) => results.push(r),
      fetcher,
      undefined,
      cached
    )
    const last = results.at(-1)!
    expect(last).toMatchObject({ status: 'success', complete: true })
    if (last.status !== 'success') throw Error('Expected suggestions')
    expect(last.candidates).toHaveLength(6)
    expect(last.candidates.slice(0, 2)).toEqual(cached)
    expect(validateResult(input, last).status).toBe('success')
  })
  it('skips the network at six hits and retains cached choices on network failure', async () => {
    const { cache } = store(),
      input = request(),
      fetcher = vi.fn<typeof fetch>()
    for (const word of ['coffee', 'cookie', 'cat', 'coat', 'car', 'cushion'])
      cache.save('iwac', `I want a ${word}`)
    const emit = vi.fn()
    await streamGemini(
      input,
      'test',
      new AbortController().signal,
      emit,
      fetcher,
      undefined,
      cache.lookup(input)
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ complete: true, candidates: expect.any(Array) })
    )
    fetcher.mockRejectedValue(new Error('offline'))
    await streamGemini(
      input,
      'test',
      new AbortController().signal,
      emit,
      fetcher,
      undefined,
      cache.lookup(input).slice(0, 1)
    )
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'success',
        complete: true,
        message: expect.stringContaining('Could not reach'),
        candidates: expect.any(Array)
      })
    )
  })
})
