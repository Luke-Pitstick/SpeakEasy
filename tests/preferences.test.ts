import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'
import { extractPreferences } from '../src/main/preferenceProvider'
import { preferenceFieldsSchema, type PreferenceFields } from '../src/shared/preferences'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import { candidateFor } from '../src/shared/predictionValidation'

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
const envelope = (
  proposals: unknown[]
): { choices: { finish_reason: string; message: { content: string } }[] } => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ proposals }) } }]
})
const fetcher = (): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>().mockImplementation(async () => Response.json(envelope([proposal])))
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

describe('approved preference lifecycle', () => {
  it('saves every commit without cloud consent or speech, but never retrieves unapproved proposals', async () => {
    const mock = fetcher(),
      service = new PreferenceService(store(), 'key', () => {}, mock)
    await service.update({ type: 'commit', id: 'plain', text: 'Hello there', conversation: [] })
    expect(service.read().sentences[0].text).toBe('Hello there')
    expect(mock).not.toHaveBeenCalled()
    await proposed(service)
    expect(service.read().facts).toEqual([])
    expect(mock.mock.calls.every(([url]) => !String(url).endsWith('/embeddings'))).toBe(true)
  })
  it('persists approved facts but not unreviewed proposals across restart', async () => {
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
    expect(restored.read().proposals).toEqual([])
    await restored.update({ type: 'forget-sentences', ids: [source.id] })
    expect(restored.read().facts).toEqual([])
    expect(restored.read().sentences).toEqual([])
  })
  it('drops a delayed extraction after source undo', async () => {
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
