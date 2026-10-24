import { preferenceQueryContext, resolvePreferenceQuery } from './preferenceQuery'
import { randomUUID } from 'node:crypto'
import { PreferenceStore } from './preferenceStore'
import { extractPreferences, embedPreferenceText, cosine } from './preferenceProvider'
import {
  preferenceOperationSchema,
  preferenceText,
  type PreferenceFields,
  type PreferenceOperation,
  type PreferenceProposal,
  type PreferenceSnapshot,
  type SentenceMemory
} from '../shared/preferences'
import type { PredictionRequest } from '../shared/prediction'
import { lexicalWords } from '../shared/predictionValidation'

export class PreferenceService {
  private proposals: PreferenceProposal[] = []
  private jobs = new Set<AbortController>()
  private topicCache: { context: string; query?: string; vector?: number[] } | null = null
  private epoch = 0
  private error = ''
  constructor(
    private store: PreferenceStore,
    private key: string,
    private changed: (invalidate?: boolean) => void,
    private fetcher: typeof fetch = fetch
  ) {}
  read(): PreferenceSnapshot {
    const facts = this.store.facts()
    return {
      ...this.store.settings(),
      facts: facts.map(({ id, fact, source, quote, scopeBasis, scopeExplanation, updatedAt }) => ({
        id,
        fact,
        source,
        quote,
        scopeBasis,
        scopeExplanation,
        updatedAt
      })),
      proposals: this.proposals,
      sentences: this.store.sentences(),
      unindexed: facts.filter((fact) => !fact.embedding).length,
      busy: this.jobs.size > 0,
      error: this.error
    }
  }
  cancel(): void {
    this.topicCache = null
    this.epoch++
    for (const job of this.jobs) job.abort()
    this.jobs.clear()
  }
  close(): void {
    this.cancel()
    this.store.close()
  }
  private async propose(
    source: SentenceMemory,
    conversation: { speaker: 'me' | 'partner'; text: string }[]
  ): Promise<void> {
    if (!this.store.settings().extract) return
    if (!this.key) {
      this.error = 'Sentence saved. Configure the OpenRouter key to extract preferences.'
      this.changed()
      return
    }
    if (this.jobs.size >= 3) {
      this.error =
        'Sentence saved. Preference learning is busy; select Find preferences on the saved sentence to retry.'
      this.changed()
      return
    }
    const controller = new AbortController(),
      epoch = this.epoch
    this.jobs.add(controller)
    this.changed()
    try {
      const proposals = await extractPreferences(
        this.key,
        source,
        conversation,
        controller.signal,
        this.fetcher
      )
      if (
        controller.signal.aborted ||
        epoch !== this.epoch ||
        !this.store.sentences().some((s) => s.id === source.id)
      )
        return
      this.proposals = [
        ...this.proposals.filter((p) => p.source.id !== source.id),
        ...proposals.map((p) => ({ ...p, id: randomUUID(), source }))
      ].slice(-20)
    } catch {
      if (!controller.signal.aborted)
        this.error =
          'Sentence saved, but preference extraction failed validation or could not reach the provider. Retry Find preferences.'
    } finally {
      this.jobs.delete(controller)
      if (!controller.signal.aborted) this.changed()
    }
  }
  async update(input: PreferenceOperation): Promise<PreferenceSnapshot> {
    const op = preferenceOperationSchema.parse(input)
    this.error = ''
    if (op.type === 'commit') {
      const source = {
        id: op.id,
        text: op.text,
        initials: lexicalWords(op.text)
          .map((w) => w[0])
          .join(''),
        createdAt: Date.now()
      }
      if (this.store.commit(source)) void this.propose(source, op.conversation)
      this.changed()
      return this.read()
    }
    if (op.type === 'extract') {
      const source = this.store.sentences().find((s) => s.id === op.id)
      if (!source) throw Error('Saved sentence no longer exists')
      await this.propose(source, [])
      return this.read()
    }
    this.cancel()
    switch (op.type) {
      case 'settings':
        this.store.configure(op.extract, op.retrieve)
        break
      case 'reject':
        this.proposals = this.proposals.filter((p) => p.id !== op.id)
        break
      case 'forget':
        this.store.forget(op.id)
        this.proposals = []
        break
      case 'forget-sentences':
        this.store.forgetSentences(op.ids)
        this.proposals = this.proposals.filter((p) => !op.ids.includes(p.source.id))
        break
      case 'clear':
        this.store.clear()
        this.proposals = []
        break
      case 'approve': {
        const proposal = this.proposals.find((p) => p.id === op.id)
        if (!proposal || !this.store.sentences().some((s) => s.id === proposal.source.id))
          throw Error('Proposal expired. Extract it again.')
        const existing = this.store.facts()
        if (op.replaceId && !existing.some((f) => f.id === op.replaceId))
          throw Error('Replacement fact no longer exists')
        const slot = (f: PreferenceFields): string =>
          JSON.stringify([f.relationship, f.scope.game, f.scope.topic]).toLowerCase()
        if (existing.some((f) => slot(f.fact) === slot(op.fact) && f.id !== op.replaceId))
          throw Error('A preference for this topic already exists. Choose Replace on that fact.')
        this.store.save(
          { ...proposal, fact: op.fact, updatedAt: Date.now(), embedding: null },
          op.replaceId
        )
        this.proposals = this.proposals.filter((p) => p.id !== op.id)
        break
      }
      case 'edit': {
        const fact = this.store.facts().find((f) => f.id === op.id)
        if (!fact) throw Error('Fact no longer exists')
        this.store.save({ ...fact, fact: op.fact, updatedAt: Date.now(), embedding: null })
        break
      }
      case 'index':
        break
    }
    this.changed(true)
    if (
      this.store.settings().retrieve &&
      ['approve', 'edit', 'index', 'settings'].includes(op.type)
    )
      await this.index()
    return this.read()
  }
  private async index(): Promise<void> {
    if (!this.key) {
      this.error = 'Facts saved. Configure the OpenRouter key, then retry semantic indexing.'
      this.changed()
      return
    }
    const controller = new AbortController(),
      epoch = this.epoch
    this.jobs.add(controller)
    this.changed()
    try {
      for (const fact of this.store.facts().filter((f) => !f.embedding)) {
        const embedding = await embedPreferenceText(
          this.key,
          preferenceText(fact.fact),
          controller.signal,
          this.fetcher
        )
        if (controller.signal.aborted || epoch !== this.epoch) return
        this.store.save({ ...fact, embedding })
      }
    } catch {
      if (!controller.signal.aborted)
        this.error =
          'Facts saved, but semantic indexing failed. Retry semantic indexing to make them searchable.'
    } finally {
      this.jobs.delete(controller)
      if (!controller.signal.aborted) this.changed()
    }
  }
  async retrieve(request: PredictionRequest, signal: AbortSignal): Promise<PreferenceFields[]> {
    const epoch = this.epoch
    try {
      if (!this.store.settings().retrieve || request.purpose !== 'expansion' || !this.key) return []
      const facts = this.store.facts().filter((f) => f.embedding)
      if (!facts.length) return []
      const hasContext = [
        request.conversationSummary ?? '',
        request.draft,
        request.lockedMessage,
        ...request.conversation.map((t) => t.text),
        ...request.tokens.filter((t) => t.kind === 'word').map((t) => t.value)
      ]
        .join(' ')
        .trim()
      if (signal.aborted) return []
      const context = preferenceQueryContext(request)
      if (this.topicCache?.context !== context) this.topicCache = { context }
      const cached = this.topicCache
      const current = (): boolean =>
        !signal.aborted && epoch === this.epoch && this.topicCache === cached
      let query = cached.query
      if (query === undefined) {
        query = hasContext
          ? await resolvePreferenceQuery(this.key, request, signal, this.fetcher)
          : ''
        if (!current()) return []
        cached.query = query
      }
      if (hasContext && !query) return []
      const initials = request.tokens.map((t) => t.value[0]).join('')
      let vector = cached.vector ?? null
      if (query && !vector) {
        vector = await embedPreferenceText(this.key, query, signal, this.fetcher)
        if (!current()) return []
        cached.vector = vector
      }
      if (!current()) return []
      const matches = facts
        .map((fact) => ({
          fact,
          score: vector
            ? cosine(vector, fact.embedding!)
            : fact.source.initials === initials
              ? 1
              : 0
        }))
        .filter((m) => m.score >= 0.3)
        .sort((a, b) => b.score - a.score)
      const selected: PreferenceFields[] = []
      for (const { fact } of matches) {
        if (JSON.stringify([...selected, fact.fact]).length <= 1800) selected.push(fact.fact)
        if (selected.length === 3) break
      }
      return selected
    } catch {
      if (!signal.aborted && epoch === this.epoch) {
        this.error = 'Semantic retrieval unavailable. Expansion continues without preference facts.'
        this.changed()
      }
      return []
    }
  }
}
