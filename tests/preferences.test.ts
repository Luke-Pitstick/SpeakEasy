import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'
import { extractPreferences, embedPreferenceText } from '../src/main/preferenceProvider'
import { preferenceFieldsSchema, type PreferenceFields } from '../src/shared/preferences'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import { candidateFor } from '../src/shared/predictionValidation'
import type { PredictionRequest } from '../src/shared/prediction'
import { resolvePreferenceQuery } from '../src/main/preferenceQuery'
import { predictionMessages } from '../src/main/gemini'

const fact: PreferenceFields = {
  type: 'preference',
  subject: 'user',
  relationship: 'favorite_deck',
  value: 'Hog Cycle',
  scope: { game: 'Clash Royale', topic: 'deck' },
  relatedTerms: ['deck', 'game', 'Clash Royale']
}
const source = {
  id: 'source',
  text: 'My favorite deck is Hog Cycle',
  initials: 'mfdihc',
  createdAt: 1
}
const proposal = {
  fact,
  quote: source.text,
  scopeBasis: 'inferred',
  scopeExplanation: 'Hog Cycle is associated with Clash Royale; please review.'
}
const vector = (axis = 0): number[] => Array.from({ length: 1536 }, (_, i) => (i === axis ? 1 : 0))
const envelope = (
  proposals: unknown[]
): { choices: { finish_reason: string; message: { content: string } }[] } => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ proposals }) } }]
})
const fetcher = (): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
    const body = JSON.parse(String(init?.body))
    if (body.response_format?.json_schema?.name === 'preference_query') {
      const context = JSON.parse(body.messages[1].content)
      const current = context.recentTurns.at(-1)?.text ?? ''
      const query = /dinner/i.test(current)
        ? 'dinner food preference'
        : 'Clash Royale deck preference'
      return Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ query }) } }]
      })
    }
    if (String(url).endsWith('/embeddings')) {
      const { input } = JSON.parse(String(init?.body))
      return Response.json({
        data: [{ index: 0, embedding: vector(String(input).includes('dinner') ? 1 : 0) }]
      })
    }
    return Response.json(envelope([proposal]))
  })
const stores: PreferenceStore[] = [],
  folders: string[] = []
function store(path = ':memory:'): PreferenceStore {
  const result = new PreferenceStore(path)
  stores.push(result)
  return result
}
afterEach(() => {
  for (const item of stores.splice(0)) {
    try {
      item.close()
    } catch {
      /* Already closed in persistence tests. */
    }
  }
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})
async function proposed(service: PreferenceService): Promise<string> {
  await service.update({ type: 'settings', extract: true, retrieve: false })
  await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
  await vi.waitFor(() => expect(service.read().proposals).toHaveLength(1))
  return service.read().proposals[0].id
}
function request(text = 'What do you usually run when we battle?'): PredictionRequest {
  return {
    id: 'q',
    revision: 1,
    purpose: 'expansion',
    lockedMessage: '',
    draft: '',
    tokens: [...'iphc'].map((value, i) => ({ id: String(i), kind: 'initial', value })),
    target: { start: 0, end: 0 },
    conversation: [{ id: 'partner', speaker: 'partner', text }]
  }
}

describe('schema and provider boundaries', () => {
  it('uses a strict schema and rejects invalid or ungrounded model proposals', async () => {
    expect(preferenceFieldsSchema.safeParse({ ...fact, execute: 'speak' }).success).toBe(false)
    expect(preferenceFieldsSchema.safeParse({ ...fact, subject: 'partner' }).success).toBe(false)
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(envelope([{ ...proposal, quote: 'I like pizza' }])))
    expect(
      await extractPreferences('key', source, [], new AbortController().signal, invalid)
    ).toEqual([])
    const malformed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(envelope([{ ...proposal, fact: { ...fact, value: 42 } }])))
    await expect(
      extractPreferences('key', source, [], new AbortController().signal, malformed)
    ).rejects.toThrow()
    const badVector = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ data: [{ index: 0, embedding: [1, 2] }] }))
    await expect(
      embedPreferenceText('key', 'query', new AbortController().signal, badVector)
    ).rejects.toThrow()
  })
  it('sends schema-constrained extraction and keeps inferred scope visible for review', async () => {
    const mock = fetcher()
    const result = await extractPreferences(
      'key',
      source,
      [{ speaker: 'partner', text: 'Which deck?' }],
      new AbortController().signal,
      mock
    )
    expect(result[0]).toEqual(proposal)
    expect(JSON.parse(String(mock.mock.calls[0][1]?.body)).response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { strict: true, schema: { additionalProperties: false } }
    })
  })
})

describe('preference lifecycle and semantic retrieval', () => {
  it('keeps expansion usable when preference storage cannot be read', async () => {
    const storage = store(),
      mock = fetcher(),
      changed = vi.fn()
    const service = new PreferenceService(storage, 'key', changed, mock)
    vi.spyOn(storage, 'settings').mockImplementation(() => {
      throw Error('Unreadable storage')
    })
    expect(await service.retrieve(request(), new AbortController().signal)).toEqual([])
    expect(mock).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalled()
  })
  it('saves every commit without cloud consent or speech, but never retrieves unapproved proposals', async () => {
    const mock = fetcher(),
      service = new PreferenceService(store(), 'key', () => {}, mock)
    await service.update({ type: 'commit', id: 'plain', text: 'Hello there', conversation: [] })
    expect(service.read().sentences[0].text).toBe('Hello there')
    expect(mock).not.toHaveBeenCalled()
    await proposed(service)
    expect(service.read().facts).toEqual([])
    expect(await service.retrieve(request(), new AbortController().signal)).toEqual([])
    expect(mock.mock.calls.every(([url]) => !String(url).endsWith('/embeddings'))).toBe(true)
  })
  it('retrieves approved facts for paraphrases using embeddings and drops unrelated context', async () => {
    const mock = fetcher(),
      service = new PreferenceService(store(), 'key', () => {}, mock)
    const id = await proposed(service)
    await service.update({ type: 'approve', id, fact, replaceId: null })
    expect(service.read().unindexed).toBe(1)
    await service.update({ type: 'settings', extract: true, retrieve: true })
    expect(await service.retrieve(request(), new AbortController().signal)).toEqual([fact])
    const messages = predictionMessages(request(), {
      vocabulary: [],
      examples: [],
      facts: await service.retrieve(request(), new AbortController().signal)
    })
    expect(JSON.parse(messages[1].content).personalMemory.facts[0].value).toBe('Hog Cycle')
    expect(
      await service.retrieve(request('What is for dinner?'), new AbortController().signal)
    ).toEqual([])
    await service.update({ type: 'edit', id, fact: { ...fact, value: 'Log Bait' } })
    expect((await service.retrieve(request(), new AbortController().signal))[0].value).toBe(
      'Log Bait'
    )
    await service.update({ type: 'forget', id })
    expect(await service.retrieve(request(), new AbortController().signal)).toEqual([])
    expect(service.read().sentences).toHaveLength(1)
  })
  it('persists approved facts and vectors but not unreviewed proposals across restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-preferences-'))
    folders.push(folder)
    const path = join(folder, 'preferences.sqlite'),
      original = store(path)
    const service = new PreferenceService(original, 'key', () => {}, fetcher())
    const id = await proposed(service)
    await service.update({ type: 'approve', id, fact, replaceId: null })
    await service.update({ type: 'settings', extract: true, retrieve: true })
    service.close()
    const restored = new PreferenceService(store(path), 'key', () => {}, fetcher())
    expect(restored.read().facts[0].fact).toEqual(fact)
    expect(restored.read().unindexed).toBe(0)
    expect(restored.read().proposals).toEqual([])
    await restored.update({ type: 'forget-sentences', ids: [source.id] })
    expect(restored.read().facts).toEqual([])
    expect(restored.read().sentences).toEqual([])
  })
  it('does not resurrect a fact from an embedding response after deletion', async () => {
    let finish: ((response: Response) => void) | undefined
    const mock = fetcher()
    const service = new PreferenceService(store(), 'key', () => {}, mock)
    const id = await proposed(service)
    await service.update({ type: 'approve', id, fact, replaceId: null })
    mock.mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    const indexing = service.update({ type: 'settings', extract: true, retrieve: true })
    await vi.waitFor(() => expect(finish).toBeDefined())
    await service.update({ type: 'forget', id })
    finish!(Response.json({ data: [{ index: 0, embedding: vector() }] }))
    await indexing
    expect(service.read().facts).toEqual([])
  })
  it('drops a delayed extraction after source undo and a delayed query after disabling retrieval', async () => {
    let finish: ((response: Response) => void) | undefined
    const mock = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    const service = new PreferenceService(store(), 'key', () => {}, mock)
    await service.update({ type: 'settings', extract: true, retrieve: false })
    await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    await service.update({ type: 'forget-sentences', ids: [source.id] })
    finish!(Response.json(envelope([proposal])))
    await vi.waitFor(() => expect(service.read().busy).toBe(false))
    expect(service.read().proposals).toEqual([])
    expect(service.read().sentences).toEqual([])
    mock.mockImplementation(fetcher())
    const id = await proposed(service)
    await service.update({ type: 'approve', id, fact, replaceId: null })
    await service.update({ type: 'settings', extract: true, retrieve: true })
    mock.mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        })
    )
    mock.mockClear()
    const query = service.retrieve(request(), new AbortController().signal)
    await service.update({ type: 'settings', extract: true, retrieve: false })
    finish!(
      Response.json({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify({ query: 'Clash Royale deck preference' }) }
          }
        ]
      })
    )
    expect(await query).toEqual([])
    expect(mock).toHaveBeenCalledOnce()
  })
  it('requires explicit replacement for an existing preference slot', async () => {
    const service = new PreferenceService(store(), 'key', () => {}, fetcher())
    const id = await proposed(service)
    await service.update({ type: 'approve', id, fact, replaceId: null })
    await service.update({ type: 'extract', id: source.id })
    const nextId = service.read().proposals[0].id
    await expect(
      service.update({
        type: 'approve',
        id: nextId,
        fact: { ...fact, value: 'Log Bait' },
        replaceId: null
      })
    ).rejects.toThrow('already exists')
    await service.update({
      type: 'approve',
      id: nextId,
      fact: { ...fact, value: 'Log Bait' },
      replaceId: id
    })
    expect(service.read().facts).toHaveLength(1)
    expect(service.read().facts[0].fact.value).toBe('Log Bait')
  })
})

it('records locked literal sentences and unchanged accepted expansions before speech and retracts undo', () => {
  let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: source.text })
  expect(state.sentenceEvents).toEqual([])
  state = reducer(state, { type: 'lock-sentence' })
  expect(state.sentenceEvents.at(-1)?.operation).toMatchObject({
    type: 'commit',
    text: source.text
  })
  expect(state.conversation.at(-1)?.text).toBe(source.text)
  state = reducer(state, { type: 'undo' })
  expect(state.conversation).toEqual([])
  expect(state.sentenceEvents.at(-1)?.operation.type).toBe('forget-sentences')
  state = reducer(initialState(), { type: 'example', initials: 'mfdihc' })
  state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'test' })
  state = reducer(state, {
    type: 'result',
    result: {
      requestId: 'test',
      revision: state.revision,
      purpose: 'expansion',
      provider: 'gemini',
      elapsedMs: 1,
      status: 'success',
      complete: true,
      candidates: [candidateFor(state.request!, source.text, 0)!]
    }
  })
  expect(state.sentenceEvents).toEqual([])
  state = reducer(state, { type: 'accept', id: state.candidates[0].id })
  expect(state.sentenceEvents.at(-1)?.operation).toMatchObject({
    type: 'commit',
    text: source.text
  })
})

it('keeps the deck discussion through speech and new messages for topic resolution', async () => {
  let state = reducer(initialState(), {
    type: 'conversation-add',
    speaker: 'partner',
    text: 'What is your favorite deck in Clash Royale?'
  })
  state = reducer(state, { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: source.text })
  state = reducer(state, { type: 'lock-sentence' })
  expect(state.conversation.at(-1)?.text).toBe(source.text)
  state = reducer(state, { type: 'speech-completed', text: source.text, revision: state.revision })
  state = reducer(state, { type: 'clear' })
  state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: 'Sounds good.' })
  state = reducer(state, {
    type: 'conversation-add',
    speaker: 'partner',
    text: 'What do you usually run when we battle?'
  })
  const input = { ...request(), conversation: state.conversation }
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  await service.retrieve(input, new AbortController().signal)
  const query = JSON.parse(String(mock.mock.calls.at(-1)?.[1]?.body)).input
  expect(query).toContain('Clash Royale')
  expect(query).not.toContain('Hog Cycle')
  const resolutionCall = mock.mock.calls.find(
    ([, init]) =>
      JSON.parse(String(init?.body)).response_format?.json_schema?.name === 'preference_query'
  )!
  const context = JSON.parse(JSON.parse(String(resolutionCall[1]?.body)).messages[1].content)
  expect(context.recentTurns.map((turn: { text: string }) => turn.text).join(' ')).toContain(
    'when we battle'
  )
  state = reducer(state, { type: 'conversation-clear' })
  expect(state.conversation).toEqual([])
})

it('embeds the resolved current topic instead of mixing historical preferences into dinner retrieval', async () => {
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  const input = {
    ...request('What is for dinner?'),
    conversationSummary: 'We discussed Clash Royale; my favorite deck is Hog Cycle.'
  }
  expect(await service.retrieve(input, new AbortController().signal)).toEqual([])
  expect(JSON.parse(String(mock.mock.calls.at(-1)?.[1]?.body)).input).toBe('dinner food preference')
  expect(service.read().facts[0].fact.value).toBe('Hog Cycle')
  expect(
    await service.retrieve(
      { ...input, conversation: request('Back to Clash Royale: which deck?').conversation },
      new AbortController().signal
    )
  ).toEqual([fact])
})

it('does not fall back to historical topics when resolution fails or returns no current topic', async () => {
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  for (const content of [
    JSON.stringify({ query: '' }),
    JSON.stringify({ query: 'x'.repeat(501) }),
    'invalid'
  ]) {
    service.cancel()
    mock.mockClear()
    mock.mockResolvedValue(
      Response.json({ choices: [{ finish_reason: 'stop', message: { content } }] })
    )
    expect(await service.retrieve(request(), new AbortController().signal)).toEqual([])
    expect(mock).toHaveBeenCalledOnce()
  }
})

it('passes ordered dialogue and summary to topic resolution without passing saved preference facts', async () => {
  const mock = fetcher()
  const input = { ...request('What is for dinner?'), conversationSummary: 'Earlier: Clash Royale.' }
  expect(await resolvePreferenceQuery('key', input, new AbortController().signal, mock)).toBe(
    'dinner food preference'
  )
  const body = JSON.parse(String(mock.mock.calls[0][1]?.body))
  const data = JSON.parse(body.messages[1].content)
  expect(data.historicalSummary).toBe(input.conversationSummary)
  expect(data.recentTurns.at(-1).text).toBe('What is for dinner?')
  expect(data).not.toHaveProperty('facts')
})

it('reuses the topic and embedding across initials changes but refreshes for each semantic context change', async () => {
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  mock.mockClear()
  let input = request('Which Clash Royale deck do you prefer?')
  expect(await service.retrieve(input, new AbortController().signal)).toEqual([fact])
  expect(mock).toHaveBeenCalledTimes(2)
  input = {
    ...input,
    id: 'different',
    revision: 20,
    tokens: [...'iw'].map((value, i) => ({ id: String(i), kind: 'initial', value }))
  }
  expect(await service.retrieve(input, new AbortController().signal)).toEqual([fact])
  expect(mock).toHaveBeenCalledTimes(2)
  const changes = [
    { conversation: request('What is for dinner?').conversation },
    { conversation: request('Which Clash Royale deck?').conversation },
    { conversationSummary: 'Earlier topics changed.' },
    { lockedMessage: 'Another sentence in the same message.' },
    { draft: 'I would like' },
    { tokens: [{ id: 'word', kind: 'word' as const, value: 'chicken' }] },
    { conversation: [] }
  ]
  for (const change of changes) {
    mock.mockClear()
    input = { ...input, ...change }
    await service.retrieve(input, new AbortController().signal)
    expect(mock).toHaveBeenCalledTimes(2)
    await service.retrieve(input, new AbortController().signal)
    expect(mock).toHaveBeenCalledTimes(2)
  }
  await service.update({ type: 'forget', id })
  expect(await service.retrieve(input, new AbortController().signal)).toEqual([])
})

it('does not let an old topic resolution overwrite a newer topic cache', async () => {
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  let finish!: (response: Response) => void
  mock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  const old = service.retrieve(request('Which game deck?'), new AbortController().signal)
  const dinner = request('What is for dinner?')
  expect(await service.retrieve(dinner, new AbortController().signal)).toEqual([])
  finish(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ query: 'Clash Royale deck' }) }
        }
      ]
    })
  )
  expect(await old).toEqual([])
  mock.mockClear()
  expect(await service.retrieve(dinner, new AbortController().signal)).toEqual([])
  expect(mock).not.toHaveBeenCalled()
})

it('does not cache cancelled resolutions and retries failed embeddings without resolving again', async () => {
  const mock = fetcher()
  const service = new PreferenceService(store(), 'key', () => {}, mock)
  const id = await proposed(service)
  await service.update({ type: 'approve', id, fact, replaceId: null })
  await service.update({ type: 'settings', extract: true, retrieve: true })
  let finish!: (response: Response) => void
  mock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      })
  )
  const controller = new AbortController()
  const pending = service.retrieve(request(), controller.signal)
  controller.abort()
  finish(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ query: 'Clash Royale deck' }) }
        }
      ]
    })
  )
  expect(await pending).toEqual([])
  mock.mockClear()
  mock.mockImplementationOnce(fetcher()).mockRejectedValueOnce(Error('Embedding unavailable'))
  expect(await service.retrieve(request(), new AbortController().signal)).toEqual([])
  expect(mock).toHaveBeenCalledTimes(2)
  mock.mockClear()
  expect(await service.retrieve(request(), new AbortController().signal)).toEqual([fact])
  expect(mock).toHaveBeenCalledOnce()
  expect(String(mock.mock.calls[0][0])).toContain('/embeddings')
})

it('learns the sentence when returning to Dasher locks it into a multi-sentence message', () => {
  let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: source.text })
  state = reducer(state, { type: 'workspace', workspace: 'phrases' })
  state = reducer(state, { type: 'workspace', workspace: 'dasher' })
  expect(state.draft).toBe('')
  expect(state.lockedSentences).toEqual([source.text])
  expect(state.sentenceEvents.at(-1)?.operation).toMatchObject({
    type: 'commit',
    text: source.text
  })
  expect(state.conversation.at(-1)?.text).toBe(source.text)
  state = reducer(state, { type: 'undo' })
  expect(state.sentenceEvents.at(-1)?.operation.type).toBe('forget-sentences')
})
