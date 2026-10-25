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
async function learned(service: PreferenceService): Promise<string> {
  await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
  await vi.waitFor(() => expect(service.read().busy).toBe(false))
  expect(service.read().error).toBe('')
  return service.read().facts[0].id
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
  it('sends schema-constrained extraction and keeps inferred scope visible in saved memory', async () => {
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

describe('automatic preference memory', () => {
  it('recovers in-flight and queued learning with the original question after window closure', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-memory-restart-'))
    folders.push(folder)
    const path = join(folder, 'preferences.sqlite')
    let finish!: (response: Response) => void
    const blocked = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const first = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      blocked
    )
    await first.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    const conversation = [
      { speaker: 'partner' as const, text: 'What is your favorite sushi roll?' }
    ]
    await first.update({ type: 'commit', id: 'sushi', text: 'Salmon roll', conversation })
    // The main-process commit acknowledges durable work without waiting for extraction or close.
    const observer = store(path)
    expect(observer.pendingLearning().map((s) => s.id)).toEqual([source.id, 'sushi'])
    expect(observer.learningContext('sushi')).toEqual(conversation)
    observer.close()
    await vi.waitFor(() => expect(blocked).toHaveBeenCalledTimes(1))
    first.close()

    const mock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const payload = JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
      if (payload.sentence === source.text) return Response.json(envelope([proposal]))
      expect(JSON.stringify(payload)).toContain('What is your favorite sushi roll?')
      return Response.json(
        envelope([
          {
            ...proposal,
            quote: 'Salmon roll',
            scopeBasis: 'conversation',
            fact: {
              ...fact,
              relationship: 'favorite_sushi',
              value: 'Salmon roll',
              scope: { game: null, topic: 'sushi' }
            }
          }
        ])
      )
    })
    const restored = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      mock
    )
    // A late response from the old window cannot write through its closed store.
    finish(Response.json(envelope([proposal])))
    await vi.waitFor(() => expect(restored.read().facts).toHaveLength(2))
    expect(mock).toHaveBeenCalledTimes(2)
    expect(restored.read().facts.some((f) => f.fact.value === 'Salmon roll')).toBe(true)
    await restored.update({ type: 'settings', retrieve: true })
    restored.close()

    const unused = fetcher()
    const reopened = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      unused
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reopened.read()).toMatchObject({ retrieve: true, busy: false, error: '' })
    expect(reopened.read().facts).toHaveLength(2)
    expect(unused).not.toHaveBeenCalled()
    reopened.close()
  })
  it('retries offline work once per restart, respects disabled generation, and keeps forgotten facts forgotten', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-memory-offline-'))
    folders.push(folder)
    const path = join(folder, 'preferences.sqlite')
    const offline = vi.fn<typeof fetch>().mockRejectedValue(Error('Offline'))
    const first = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      offline
    )
    await first.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    await vi.waitFor(() => expect(first.read().error).toContain('learning failed'))
    expect(offline).toHaveBeenCalledTimes(1)
    first.close()
    let enabled = false
    const mock = fetcher()
    const restored = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => enabled,
      mock
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mock).not.toHaveBeenCalled()
    enabled = true
    restored.resume(true)
    await vi.waitFor(() => expect(restored.read().facts).toHaveLength(1))
    await restored.update({ type: 'forget', id: restored.read().facts[0].id })
    restored.close()
    const unused = fetcher()
    const reopened = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      unused
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reopened.read().sentences).toHaveLength(1)
    expect(reopened.read().facts).toEqual([])
    expect(unused).not.toHaveBeenCalled()
    reopened.close()
  })
  it('does not retry completed non-preferences or deleted pending sources after restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-memory-empty-'))
    folders.push(folder)
    const path = join(folder, 'preferences.sqlite')
    const mock = vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope([])))
    const first = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      mock
    )
    await first.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    await vi.waitFor(() => expect(first.read().busy).toBe(false))
    // Commit a queued source directly to simulate exit before learning starts.
    const db = store(path)
    db.commit({ ...source, id: 'deleted' }, [], true)
    db.forgetSentences(['deleted'])
    db.close()
    first.close()
    const unused = fetcher()
    const reopened = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      unused
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reopened.read().facts).toEqual([])
    expect(unused).not.toHaveBeenCalled()
    reopened.close()
  })
  it('saves the source locally without generation consent and learns automatically when enabled', async () => {
    let enabled = false
    const mock = fetcher(),
      service = new PreferenceService(
        store(),
        'key',
        () => {},
        () => enabled,
        mock
      )
    await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    expect(service.read().sentences).toHaveLength(1)
    expect(service.read().facts).toEqual([])
    expect(mock).not.toHaveBeenCalled()
    enabled = true
    await service.update({ type: 'extract', id: source.id })
    expect(service.read().facts[0].fact).toEqual(fact)
    expect(mock.mock.calls.every(([url]) => !String(url).endsWith('/embeddings'))).toBe(true)
  })
  it('persists automatically learned facts across restart and deletes source-dependent facts', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-preferences-'))
    folders.push(folder)
    const path = join(folder, 'preferences.sqlite')
    const service = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      fetcher()
    )
    await learned(service)
    service.close()
    const restored = new PreferenceService(
      store(path),
      'key',
      () => {},
      () => true,
      fetcher()
    )
    expect(restored.read().facts[0].fact).toEqual(fact)
    await restored.update({ type: 'forget-sentences', ids: [source.id] })
    expect(restored.read().facts).toEqual([])
    expect(restored.read().sentences).toEqual([])
  })
  it.each(['forget-sentences', 'clear', 'disable'] as const)(
    'rejects late learning after %s',
    async (operation) => {
      let finish!: (response: Response) => void
      let enabled = true
      const mock = vi.fn<typeof fetch>().mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      const service = new PreferenceService(
        store(),
        'key',
        () => {},
        () => enabled,
        mock
      )
      await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
      await vi.waitFor(() => expect(finish).toBeDefined())
      if (operation === 'disable') {
        enabled = false
        service.cancel()
      } else if (operation === 'clear') await service.update({ type: 'clear' })
      else await service.update({ type: 'forget-sentences', ids: [source.id] })
      finish(Response.json(envelope([proposal])))
      await vi.waitFor(() => expect(service.read().busy).toBe(false))
      expect(service.read().facts).toEqual([])
    }
  )
  it('queues rapid commits, updates the same preference, and never backfills over a newer assertion', async () => {
    const mock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const sentence = JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
        .sentence as string
      return Response.json(
        envelope([
          { ...proposal, quote: sentence, fact: { ...fact, value: sentence.split(' ').at(-1) } }
        ])
      )
    })
    const service = new PreferenceService(
      store(),
      'key',
      () => {},
      () => true,
      mock
    )
    for (let i = 0; i < 8; i++)
      await service.update({
        type: 'commit',
        id: `source-${i}`,
        text: `My favorite deck is Deck${i}`,
        conversation: []
      })
    await vi.waitFor(() => expect(service.read().busy).toBe(false))
    expect(mock).toHaveBeenCalledTimes(8)
    expect(service.read().facts).toHaveLength(1)
    const id = service.read().facts[0].id
    expect(service.read().facts[0].fact.value).toBe('Deck7')
    await service.update({ type: 'extract', id: 'source-0' })
    expect(service.read().facts[0]).toMatchObject({ id, fact: { value: 'Deck7' } })
    await service.update({ type: 'edit', id, fact: { ...fact, value: 'Log Bait' } })
    expect(service.read().facts[0].fact.value).toBe('Log Bait')
    await service.update({ type: 'forget', id })
    expect(service.read().facts).toEqual([])
  })
  it('keeps several grounded personal facts for one relationship and forgets them individually', async () => {
    const mock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const sentence = JSON.parse(JSON.parse(String(init?.body)).messages[1].content)
        .sentence as string
      const name = sentence.split(' ').at(-1)!
      return Response.json(
        envelope([
          {
            ...proposal,
            quote: sentence,
            scopeBasis: 'explicit',
            fact: {
              type: 'personal_fact',
              subject: 'user',
              relationship: 'sister',
              value: name,
              scope: { game: null, topic: null },
              relatedTerms: ['family']
            }
          }
        ])
      )
    })
    const service = new PreferenceService(
      store(),
      'key',
      () => {},
      () => true,
      mock
    )
    for (const [i, text] of ['My sister is Ana', 'My sister is Mia', 'My sister is Ana'].entries())
      await service.update({ type: 'commit', id: `sister-${i}`, text, conversation: [] })
    await vi.waitFor(() => expect(service.read().busy).toBe(false))
    expect(
      service
        .read()
        .facts.map((f) => f.fact.value)
        .sort()
    ).toEqual(['Ana', 'Mia'])
    const ana = service.read().facts.find((f) => f.fact.value === 'Ana')!
    await service.update({ type: 'forget', id: ana.id })
    expect(service.read().facts.map((f) => f.fact.value)).toEqual(['Mia'])
  })
  it('keeps failed extraction recoverable without saving an ungrounded fact', async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(Error('Offline'))
      .mockImplementation(fetcher())
    const service = new PreferenceService(
      store(),
      'key',
      () => {},
      () => true,
      mock
    )
    await service.update({ type: 'commit', id: source.id, text: source.text, conversation: [] })
    await vi.waitFor(() => expect(service.read().busy).toBe(false))
    expect(service.read().facts).toEqual([])
    expect(service.read().error).toContain('automatic memory learning failed')
    await service.update({ type: 'extract', id: source.id })
    expect(service.read().facts[0].fact).toEqual(fact)
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

it('commits directly spoken text exactly once without treating microphone turns as user assertions', () => {
  let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
  state = reducer(state, {
    type: 'conversation-add',
    speaker: 'partner',
    text: 'What is your favorite sushi roll?'
  })
  expect(state.sentenceEvents).toEqual([])
  state = reducer(state, { type: 'input', text: 'Salmon roll' })
  expect(state.sentenceEvents).toEqual([])
  state = reducer(state, { type: 'speech-confirmed', id: 'playback', text: 'Salmon roll' })
  expect(state.sentenceEvents).toHaveLength(1)
  expect(state.sentenceEvents[0].operation).toMatchObject({
    type: 'commit',
    text: 'Salmon roll',
    conversation: [{ speaker: 'partner', text: 'What is your favorite sushi roll?' }]
  })
  expect(state.conversation.at(-1)).toMatchObject({ speaker: 'me', text: 'Salmon roll' })
  state = reducer(state, { type: 'speech-confirmed', id: 'replay', text: 'Salmon roll' })
  expect(state.sentenceEvents).toHaveLength(1)
  state = reducer(state, {
    type: 'speech-completed',
    text: 'Salmon roll',
    revision: state.revision
  })
  expect(state.sentenceEvents).toHaveLength(1)
  expect(state.conversation.filter((t) => t.speaker === 'me')).toHaveLength(1)
})

it('does not recommit locked parts when confirming speech for a multi-sentence message', () => {
  let state = reducer(initialState(), { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: 'I like sushi.' })
  state = reducer(state, { type: 'workspace', workspace: 'phrases' })
  state = reducer(state, { type: 'workspace', workspace: 'dasher' })
  state = reducer(state, { type: 'mode', mode: 'literal' })
  state = reducer(state, { type: 'input', text: 'Salmon roll is my favorite.' })
  state = reducer(state, {
    type: 'speech-confirmed',
    id: 'message',
    text: 'I like sushi. Salmon roll is my favorite.'
  })
  const commits = state.sentenceEvents.map((e) => e.operation).filter((op) => op.type === 'commit')
  expect(commits.map((op) => op.text)).toEqual(['I like sushi.', 'Salmon roll is my favorite.'])
  expect(new Set(state.sentenceEvents.map((e) => e.sequence)).size).toBe(
    state.sentenceEvents.length
  )
})

it('invalidates background suggestions without pausing steering or dropping retained conversation', () => {
  let state = initialState()
  for (let i = 0; i < 10; i++)
    state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: `Turn ${i}` })
  state = reducer(state, { type: 'input', text: 'sushi' })
  state = reducer(state, { type: 'resume' })
  const session = state.session,
    history = state.conversationArchive
  const learned = reducer(state, { type: 'memory-learned' })
  expect(learned.paused).toBe(false)
  expect(learned.session).toBe(session)
  expect(learned.conversationArchive).toBe(history)
  expect(learned.revision).toBe(state.revision + 1)
  expect(learned.request).toBeNull()
})
