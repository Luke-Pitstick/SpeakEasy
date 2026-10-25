import { describe, expect, it, vi } from 'vitest'
import { listPhraseModels, predictionMessages, streamGemini } from '../src/main/gemini'
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
  it('sends the selected model without the previous model-specific price restriction', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response([frame('I want a coffee', 'stop')]))
    await streamGemini(
      request(),
      'secret',
      new AbortController().signal,
      vi.fn(),
      fetcher,
      undefined,
      [],
      'test/selected-model'
    )
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      model: 'test/selected-model',
      provider: { sort: 'latency' }
    })
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).provider).not.toHaveProperty(
      'max_price'
    )
  })
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
      reasoning: { effort: 'low', exclude: true }
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
    expect(results[1]).toMatchObject({
      status: 'success',
      complete: true,
      candidates: [{ text: 'I want a coffee' }],
      message: expect.stringContaining('stopped before finishing')
    })
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
  it('repairs rejected alternatives once without moving accepted choices or loosening initials', async () => {
    const input = {
      ...request(),
      tokens: [...'ittitc'].map((value, i) => ({ id: String(i), kind: 'initial' as const, value }))
    }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response([
          frame(
            "I think that it's too complicated.\nI think that trigonometry is too confusing.",
            'stop'
          )
        ])
      )
      .mockResolvedValueOnce(
        response([
          frame(
            "I think trigonometry is too confusing.\nI think trigonometry is too complicated.\nI think that it's too complicated.",
            'stop'
          )
        ])
      )
    const results: PredictionResult[] = []
    await streamGemini(
      input,
      'secret',
      new AbortController().signal,
      (r) => results.push(r),
      fetcher
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    const repair = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
    expect(repair.messages.at(-1).content).toContain('I think that trigonometry is too confusing.')
    const final = results.at(-1)!
    expect(final.status).toBe('success')
    if (final.status !== 'success') throw Error('Expected success')
    expect(final.candidates.map((c) => c.text)).toEqual([
      "I think that it's too complicated.",
      'I think trigonometry is too confusing.',
      'I think trigonometry is too complicated.'
    ])
    expect(final.candidates[0].id).toBe(
      results[0].status === 'success' ? results[0].candidates[0].id : ''
    )
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

describe('phrase model catalog', () => {
  it('loads text models from the public catalog and filters unsuitable entries', async () => {
    const architecture = { input_modalities: ['text'], output_modalities: ['text'] }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        data: [
          { id: 'test/zed', name: 'Zed', architecture },
          { id: 'test/alpha', name: 'Alpha', architecture },
          { id: 'bad id', name: 'Invalid', architecture },
          {
            id: 'test/image',
            name: 'Image',
            architecture: { input_modalities: ['text'], output_modalities: ['image'] }
          }
        ]
      })
    )
    expect(await listPhraseModels(fetcher)).toEqual([
      { id: 'test/alpha', name: 'Alpha' },
      { id: 'test/zed', name: 'Zed' }
    ])
    expect(fetcher.mock.calls[0][0]).toBe(
      'https://openrouter.ai/api/v1/models?output_modalities=text'
    )
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty('headers')
  })
  it('surfaces catalog failures and rejects malformed responses', async () => {
    await expect(
      listPhraseModels(vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 503 })))
    ).rejects.toThrow('Could not load')
    await expect(
      listPhraseModels(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: 'invalid' })))
    ).rejects.toThrow()
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
    expect(reducer(accepted, { type: 'clear' }).conversation).toEqual(accepted.conversation)
    expect(accepted.conversation.at(-1)?.text).toBe('I want a coffee')
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

describe('word replacement', () => {
  const refinement = (): PredictionRequest => ({
    ...request(),
    purpose: 'refinement',
    draft: 'I want a coffee',
    target: { start: 9, end: 15 }
  })
  it('asks for single same-letter words instead of the expansion instructions', () => {
    const [system, user] = predictionMessages(refinement())
    expect(system.content).toContain('alternative single words')
    expect(system.content).not.toContain('Expand initials')
    const payload = JSON.parse(user.content)
    expect(payload).toMatchObject({
      sentence: 'I want a coffee',
      before: 'I want a ',
      selectedWord: 'coffee',
      after: ''
    })
  })
  it('accepts decorated single words but rejects sentences, other letters, and the same word', () => {
    const input = refinement()
    expect(candidateFor(input, '"Cocoa."', 0)).toMatchObject({
      replacement: 'Cocoa',
      text: 'I want a Cocoa'
    })
    expect(candidateFor(input, 'cookie,', 0)?.text).toBe('I want a cookie')
    expect(candidateFor(input, 'I want a cookie', 0)).toBeNull()
    expect(candidateFor(input, 'tea', 0)).toBeNull()
    expect(candidateFor(input, 'Coffee', 0)).toBeNull()
  })
  it('repairs a reply with too few usable words once', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([frame('I want a cocoa.\ncocoa\ncoffee', 'stop')]))
      .mockResolvedValueOnce(response([frame('cookie\ncake\ncola', 'stop')]))
    const results: PredictionResult[] = []
    await streamGemini(
      refinement(),
      'secret',
      new AbortController().signal,
      (r) => results.push(r),
      fetcher
    )
    expect(fetcher).toHaveBeenCalledTimes(2)
    const repair = JSON.parse(String(fetcher.mock.calls[1][1]?.body))
    expect(repair.messages.at(-1).content).toContain('too few usable replacement words')
    const final = results.at(-1)!
    if (final.status !== 'success') throw Error('Expected success')
    expect(final.candidates.map((c) => c.replacement)).toEqual(['cocoa', 'cookie', 'cake', 'cola'])
  })
})

describe('punctuation context', () => {
  it.each(['?', '!'])('keeps %s out of word slots and preserves the requested ending', (mark) => {
    const input = request()
    input.tokens = [
      ...[...'cyhm'].map((value, i) => ({ id: String(i), kind: 'initial' as const, value })),
      { id: 'end', kind: 'punctuation', value: mark }
    ]
    expect(validRequest(input)).toBe(true)
    const payload = JSON.parse(predictionMessages(input)[1].content)
    expect(payload.initials).toBe('cyhm')
    expect(payload.wordCount).toBe(4)
    expect(payload.constraints.map((c: { value: string }) => c.value)).toEqual([...'cyhm'])
    expect(payload.punctuationContext).toEqual([{ afterWord: 4, mark }])
    expect(candidateFor(input, `Can you help me${mark}`, 0)?.text).toBe(`Can you help me${mark}`)
    expect(candidateFor(input, 'Can you help me punctuation', 0)).toBeNull()
    expect(candidateFor(input, 'Can you help me.', 0)).toBeNull()
    expect(
      validRequest({ ...input, tokens: [{ id: 'end', kind: 'punctuation', value: mark }] })
    ).toBe(false)
    expect(
      validRequest({
        ...input,
        tokens: [...input.tokens.slice(0, -1), { id: 'end', kind: 'punctuation', value: 'word' }]
      })
    ).toBe(false)
  })

  it('keeps punctuation out of word counts in repair requests', async () => {
    const input = request()
    input.tokens.push({ id: 'end', kind: 'punctuation', value: '!' })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response([frame('I want a coffee.', 'stop')]))
      .mockResolvedValue(
        response([frame('I want a coffee!\nI want a cookie!\nI want a cushion!', 'stop')])
      )
    const emit = vi.fn()
    await streamGemini(input, 'key', new AbortController().signal, emit, fetcher)
    const repair = JSON.parse(
      JSON.parse(String(fetcher.mock.calls[1][1]?.body)).messages.at(-1).content
    )
    expect(repair.requiredWordCount).toBe(4)
    expect(repair.orderedConstraints).toHaveLength(4)
    expect(repair.punctuationContext).toEqual([{ afterWord: 4, mark: '!' }])
    expect(emit).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'success', complete: true })
    )
  })
})
