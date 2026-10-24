import { describe, expect, it, vi } from 'vitest'
import { predictionMessages, streamGemini } from '../src/main/gemini'
import { candidateFor, validRequest, validateResult } from '../src/shared/predictionValidation'
import {
  EXPANSION_MODEL,
  type PredictionRequest,
  type PredictionResult
} from '../src/shared/prediction'
import { initialState, reducer } from '../src/renderer/src/composition/model'

const request = (): PredictionRequest => ({
  id: 'test',
  revision: 1,
  purpose: 'expansion',
  lockedMessage: '',
  draft: '',
  target: { start: 0, end: 0 },
  tokens: [...'iwac'].map((value, i) => ({ id: String(i), kind: 'initial', value })),
  conversation: [{ id: 'partner', speaker: 'partner', text: 'Would you like a drink?' }]
})
const frame = (content: string, finish: string | null = null): string =>
  `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: finish }] })}\n\n`
function response(chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk))
        controller.close()
      }
    })
  )
}
const success = (
  input: PredictionRequest,
  complete: boolean,
  lines = ['I want a coffee']
): PredictionResult => ({
  requestId: input.id,
  revision: input.revision,
  purpose: input.purpose,
  provider: 'gemini',
  elapsedMs: 1,
  status: 'success',
  complete,
  candidates: lines.map((line, i) => candidateFor(input, line, i)!)
})

describe('Gemini streaming boundary', () => {
  it('publishes completed valid lines incrementally, preserves their identities, and caps at six', async () => {
    const results: PredictionResult[] = []
    const input = request()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        response([
          frame('I want a cof').slice(0, 11),
          frame('I want a cof').slice(11),
          frame('fee\nI want a coffee.\nwrong answer\nI want a cookie\n'),
          frame(
            'I would appreciate company\nI want another cushion\nI want a cat\nI want a coat\nI want a car\n'
          )
        ])
      )
    await streamGemini(
      input,
      'secret',
      new AbortController().signal,
      (result) => results.push(result),
      fetcher
    )
    expect(results).toHaveLength(7)
    expect(results[0]).toMatchObject({
      status: 'success',
      complete: false,
      candidates: [{ text: 'I want a coffee' }]
    })
    expect(results.at(-1)).toMatchObject({ status: 'success', complete: true })
    if (results.at(-1)?.status === 'success')
      expect(results.at(-1)).toHaveProperty('candidates.length', 6)
    const payload = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    expect(payload).toMatchObject({
      model: EXPANSION_MODEL,
      stream: true,
      reasoning: { enabled: false }
    })
    expect(JSON.parse(payload.messages[1].content).conversation).toEqual([
      { speaker: 'partner', text: 'Would you like a drink?' }
    ])
    expect(JSON.stringify(payload)).not.toContain('secret')
  })
  it('does not publish an unfinished or truncated last line', async () => {
    const results: PredictionResult[] = []
    await streamGemini(
      request(),
      'secret',
      new AbortController().signal,
      (r) => results.push(r),
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(response([frame('I want a coffee\nI want a cat', 'length')]))
    )
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({
      status: 'success',
      candidates: [{ text: 'I want a coffee' }]
    })
    expect(results[1]).toMatchObject({ status: 'error' })
  })
  it('accepts the last line only after a normal finish and surfaces HTTP failures without bodies', async () => {
    const results: PredictionResult[] = []
    await streamGemini(
      request(),
      'secret',
      new AbortController().signal,
      (r) => results.push(r),
      vi.fn<typeof fetch>().mockResolvedValue(response([frame('I want a coffee', 'stop')]))
    )
    expect(results.at(-1)).toMatchObject({
      status: 'success',
      complete: true,
      candidates: [{ text: 'I want a coffee' }]
    })
    await streamGemini(
      request(),
      'secret',
      new AbortController().signal,
      (r) => results.push(r),
      vi.fn<typeof fetch>().mockResolvedValue(new Response('private diagnostic', { status: 401 }))
    )
    expect(results.at(-1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('key was rejected')
    })
    expect(JSON.stringify(results)).not.toContain('private diagnostic')
  })
  it('aborts an in-flight request without publishing an error or late candidates', async () => {
    const controller = new AbortController(),
      emit = vi.fn()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError'))
          )
        })
    )
    const running = streamGemini(request(), 'secret', controller.signal, emit, fetcher)
    controller.abort()
    await running
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(emit).not.toHaveBeenCalled()
  })
  it('times out a stalled request with an actionable error', async () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn()
      const fetcher = vi.fn<typeof fetch>().mockImplementation(
        async (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            )
          })
      )
      const running = streamGemini(request(), 'secret', new AbortController().signal, emit, fetcher)
      await vi.advanceTimersByTimeAsync(12000)
      await running
      expect(emit).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', message: expect.stringContaining('timed out') })
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('conversation and constraint safety', () => {
  it('refreshes an active expansion for a finalized partner turn and exposes clear epochs', () => {
    let state = reducer(initialState(), { type: 'cloud', enabled: true })
    state = reducer(state, { type: 'example', initials: 'iwac' })
    state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'old' })
    const old = state.request!
    state = reducer(state, {
      type: 'conversation-add',
      speaker: 'partner',
      text: 'Would you like coffee?'
    })
    expect(state.request?.id).not.toBe(old.id)
    expect(state.request?.revision).toBe(state.revision)
    expect(state.request?.conversation.at(-1)?.text).toBe('Would you like coffee?')
    expect(reducer(state, { type: 'result', result: success(old, true) })).toBe(state)
    state = reducer(state, { type: 'conversation-clear' })
    expect(state.contextEpoch).toBe(1)
    expect(state.request).toBeNull()
    expect(reducer(state, { type: 'undo' }).contextEpoch).toBe(1)
  })
  it('bounds the request and enforces prefixes, locked words, duplicates and six slots', () => {
    const input = request()
    expect(validRequest(input)).toBe(true)
    expect(validRequest({ ...input, conversation: Array(9).fill(input.conversation[0]) })).toBe(
      false
    )
    expect(validRequest({ ...input, target: { start: -1, end: 0 } })).toBe(false)
    input.tokens[2] = { id: '2', kind: 'word', value: 'another' }
    input.tokens[3] = { id: '3', kind: 'prefix', value: 'cu' }
    expect(candidateFor(input, 'I want another cushion', 0)).not.toBeNull()
    expect(candidateFor(input, 'I want a cushion', 0)).toBeNull()
    expect(candidateFor(input, 'I want another coffee', 0)).toBeNull()
    const base = success(request(), true)
    if (base.status !== 'success') throw Error('fixture')
    expect(
      validateResult(request(), { ...base, candidates: [...base.candidates, ...base.candidates] })
        .status
    ).toBe('error')
    expect(
      validateResult(request(), { ...base, candidates: Array(7).fill(base.candidates[0]) }).status
    ).toBe('error')
  })
  it('keeps recent conversation through New message, and invalidates old results when context changes', () => {
    let state = initialState()
    for (let i = 0; i < 10; i++)
      state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: `Turn ${i}` })
    expect(state.conversation).toHaveLength(8)
    expect(state.conversation[0].text).toBe('Turn 2')
    state = reducer(state, { type: 'example', initials: 'iwac' })
    state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'stream' })
    const input = state.request!
    expect(input.conversation).toEqual(state.conversation)
    state = reducer(state, { type: 'result', result: success(input, false) })
    expect(state.draft).toBe('')
    expect(state.status).toBe('loading')
    const accepted = reducer(state, { type: 'accept', id: state.candidates[0].id })
    expect(accepted.draft).toBe('I want a coffee')
    expect(accepted.request).toBeNull()
    expect(reducer(accepted, { type: 'clear' }).conversation).toEqual(state.conversation)
    state = reducer(state, { type: 'conversation-clear' })
    expect(state.conversation).toEqual([])
    expect(reducer(state, { type: 'result', result: success(input, true) })).toBe(state)
  })
})

it('passes locked sentences as context outside the editable draft and validates the context bound', () => {
  const input = { ...request(), lockedMessage: 'I am tired.' }
  expect(validRequest(input)).toBe(true)
  const payload = JSON.parse(predictionMessages(input)[1].content)
  expect(payload.lockedMessage).toBe('I am tired.')
  expect(payload.draft).toBe('')
  expect(candidateFor(input, 'I want a coffee', 0)?.text).toBe('I want a coffee')
  expect(validRequest({ ...input, lockedMessage: 'x'.repeat(2001) })).toBe(false)
})
