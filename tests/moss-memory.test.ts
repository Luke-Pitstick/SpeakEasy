import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'
import { describe, expect, it, vi } from 'vitest'
import {
  MossMemory,
  modelContextResolver,
  selectMossFacts,
  type ContextDecision,
  type LocalIndex
} from '../src/main/mossMemory'
import type { PredictionRequest, ConversationTurn } from '../src/shared/prediction'
import type { ApprovedPreference } from '../src/shared/preferences'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import { conversationHistorySchema } from '../src/shared/conversationHistory'
import { validRequest } from '../src/shared/predictionValidation'

const history: ConversationTurn[] = [
  { id: 'game', speaker: 'partner', text: 'Which deck do you play in Clash Royale?' },
  { id: 'dinner', speaker: 'partner', text: 'What would you like for dinner?' }
]
const fact = (
  id: string,
  value: string,
  game: string | null,
  topic: string
): ApprovedPreference => ({
  id,
  fact: {
    type: 'preference',
    subject: 'user',
    relationship: game ? 'favorite_deck' : 'favorite_food',
    value,
    scope: { game, topic },
    relatedTerms: []
  },
  source: { id: `source-${id}`, text: `I like ${value}`, initials: 'il', createdAt: 1 },
  quote: `I like ${value}`,
  scopeBasis: 'explicit',
  scopeExplanation: '',
  updatedAt: 1
})
const request: PredictionRequest = {
  id: 'request',
  revision: 1,
  purpose: 'expansion',
  lockedMessage: '',
  draft: '',
  target: { start: 0, end: 0 },
  conversation: history,
  tokens: [...'iwac'].map((value, i) => ({ id: String(i), kind: 'initial', value }))
}
const sample = {
  request,
  history,
  facts: [
    fact('alex-a', 'Hog Cycle', 'Clash Royale', 'deck'),
    fact('alex-b', 'curry', null, 'dinner'),
    fact('similar-game', 'control', 'Magic', 'deck'),
    fact('similar-meal', 'pasta', null, 'dinner')
  ]
}
const decision: ContextDecision = {
  topic: 'dinner',
  timeFrame: 'future',
  replyIntent: 'answer',
  vocabulary: [],
  query: 'preferred dinner meal',
  game: null,
  relationship: 'favorite_food',
  certain: true,
  evidenceIds: [sample.history.at(-1)!.id]
}
function index(): LocalIndex & { documents: Map<string, { id: string; text: string }> } {
  const documents = new Map<string, { id: string; text: string }>()
  return {
    documents,
    addDocs: vi.fn(async (docs) => {
      for (const d of docs) documents.set(d.id, d)
      return { added: docs.length, updated: 0 }
    }),
    deleteDocs: vi.fn(async (ids) => {
      for (const id of ids) documents.delete(id)
      return ids.length
    }),
    query: vi.fn(async (query) => ({
      query,
      docs: [...documents.values()].map((d) => ({ ...d, score: d.id === 'alex-b' ? 0.8 : 0.1 }))
    })),
    close: vi.fn(async () => {
      documents.clear()
    })
  }
}

describe('Moss context and durable-memory selection', () => {
  it('sends only selected context and reuses the decision for initials edits', async () => {
    const resolver = vi.fn(async () => decision)
    const runtime = new MossMemory(index(), index(), resolver)
    const result = await runtime.retrieve(
      sample.request,
      sample.history,
      sample.facts,
      new AbortController().signal
    )
    expect(result.request.conversation.map((t) => t.id)).toEqual(decision.evidenceIds)
    expect(result.factIds).toEqual(['alex-b'])
    await runtime.retrieve(
      {
        ...sample.request,
        id: 'next',
        revision: 2,
        tokens: sample.request.tokens.map((t) => ({ ...t, value: 'z' }))
      },
      sample.history,
      sample.facts,
      new AbortController().signal
    )
    expect(resolver).toHaveBeenCalledTimes(1)
    await runtime.retrieve(
      {
        ...sample.request,
        tokens: [...sample.request.tokens, { id: 'question', kind: 'punctuation', value: '?' }]
      },
      sample.history,
      sample.facts,
      new AbortController().signal
    )
    expect(resolver).toHaveBeenCalledTimes(2)
    await runtime.close()
  })
  it('passes sentence punctuation to the shared context decision independently of locked words', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(decision) } }]
      })
    )
    await modelContextResolver('test-key', fetcher)(
      {
        ...sample.request,
        tokens: [...sample.request.tokens, { id: 'question', kind: 'punctuation', value: '?' }]
      },
      sample.history,
      new AbortController().signal
    )
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
    const payload = JSON.parse(body.messages[1].content)
    expect(payload.punctuationContext).toEqual([{ afterWord: 4, mark: '?' }])
    expect(payload.lockedWords).toEqual([])
  })
  it('rejects late results when a memory is forgotten and removes the indexed record', async () => {
    let release!: (value: ContextDecision) => void
    const started = Promise.withResolvers<void>()
    const turns = index(),
      memories = index()
    const runtime = new MossMemory(turns, memories, async () => {
      started.resolve()
      return new Promise((r) => {
        release = r
      })
    })
    const pending = runtime.retrieve(
      sample.request,
      sample.history,
      sample.facts,
      new AbortController().signal
    )
    const rejected = expect(pending).rejects.toThrow('cancelled')
    await started.promise
    const mutation = runtime.reconcile(
      sample.history,
      sample.facts.filter((f) => f.id !== 'alex-b')
    )
    release(decision)
    await rejected
    await mutation
    expect(memories.documents.has('alex-b')).toBe(false)
    await runtime.reconcile([], [])
    expect(turns.documents.size).toBe(0)
    expect(memories.documents.size).toBe(0)
    await runtime.close()
  })
  it('rejects invented source IDs and does not cache the failed decision', async () => {
    const resolver = vi.fn(async () => ({ ...decision, evidenceIds: ['invented'] }))
    const runtime = new MossMemory(index(), index(), resolver)
    await expect(
      runtime.retrieve(sample.request, sample.history, sample.facts, new AbortController().signal)
    ).rejects.toThrow('unknown evidence')
    resolver.mockResolvedValue(decision)
    const next = await runtime.retrieve(
      sample.request,
      sample.history,
      sample.facts,
      new AbortController().signal
    )
    expect(next.cacheHit).toBe(false)
    await runtime.close()
  })
  it('preserves hybrid order, excludes stale IDs and conflicting games, and abstains on uncertainty', () => {
    const hits = [
      { id: 'deleted', score: 1 },
      { id: 'alex-a', score: 0.85 },
      { id: 'similar-game', score: 0.9 }
    ]
    expect(
      selectMossFacts(hits, sample.facts, {
        ...decision,
        game: 'Clash Royale',
        query: 'Clash Royale deck preference',
        relationship: 'favorite_deck'
      }).ids
    ).toEqual(['alex-a'])
    expect(selectMossFacts(hits, sample.facts, { ...decision, certain: false }).ids).toEqual([])
    expect(selectMossFacts([{ id: 'alex-b', score: 0.29 }], sample.facts, decision).ids).toEqual([])
    expect(
      selectMossFacts(
        [
          { id: 'alex-b', score: 0.7 },
          { id: 'similar-meal', score: 0.75 }
        ],
        sample.facts,
        { ...decision, query: 'meal preference', relationship: null }
      ).ids
    ).toEqual(['alex-b', 'similar-meal'])
  })
})

describe('temporary source history', () => {
  it('retains earlier turns, synchronizes edits, clears on request, and supplies bounded context by default', () => {
    let state = initialState()
    for (let i = 0; i < 520; i++)
      state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: `Message ${i}` })
    expect(state.conversationArchive).toHaveLength(500)
    expect(state.conversation).toHaveLength(8)
    const id = state.conversation.at(-1)!.id
    state = reducer(state, { type: 'conversation-edit', id, text: 'Corrected' })
    expect(state.conversationArchive.at(-1)?.text).toBe('Corrected')
    state = reducer(state, { type: 'conversation-remove', id })
    expect(state.conversationArchive.some((t) => t.id === id)).toBe(false)
    state = reducer(state, { type: 'history-reset' })
    expect(state.conversationArchive).toEqual(state.conversation)
    state = reducer(state, { type: 'conversation-clear' })
    expect(state.conversationArchive).toEqual([])
  })
  it('does not retain an unbounded or duplicate IPC history', () => {
    expect(
      conversationHistorySchema.safeParse([sample.history[0], sample.history[0]]).success
    ).toBe(false)
    expect(
      validRequest({ ...sample.request, conversationHistory: Array(501).fill(sample.history[0]) })
    ).toBe(false)
    expect(validRequest({ ...sample.request, conversationHistory: sample.history })).toBe(true)
  })
})

it('never sends facts to cloud embedding when approving, editing, or enabling memory', async () => {
  const db = new PreferenceStore(':memory:')
  db.save(sample.facts[0])
  const fetcher = vi.fn<typeof fetch>()
  const service = new PreferenceService(
    db,
    'test-key',
    () => {},
    () => true,
    fetcher
  )
  await service.update({ type: 'settings', retrieve: true })
  await service.update({ type: 'edit', id: sample.facts[0].id, fact: sample.facts[0].fact })
  expect(fetcher).not.toHaveBeenCalled()
  expect(service.read().facts).toHaveLength(1)
  service.close()
})
