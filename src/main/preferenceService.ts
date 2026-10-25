import { randomUUID } from 'node:crypto'
import { PreferenceStore } from './preferenceStore'
import { extractPreferences } from './preferenceProvider'
import {
  preferenceOperationSchema,
  type PreferenceFields,
  type PreferenceOperation,
  type PreferenceProposal,
  type PreferenceSnapshot,
  type SentenceMemory
} from '../shared/preferences'
import { lexicalWords } from '../shared/predictionValidation'

export class PreferenceService {
  private proposals: PreferenceProposal[] = []
  private jobs = new Set<AbortController>()
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
      busy: this.jobs.size > 0,
      error: this.error
    }
  }
  cancel(): void {
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
        this.store.save({ ...proposal, fact: op.fact, updatedAt: Date.now() }, op.replaceId)
        this.proposals = this.proposals.filter((p) => p.id !== op.id)
        break
      }
      case 'edit': {
        const fact = this.store.facts().find((f) => f.id === op.id)
        if (!fact) throw Error('Fact no longer exists')
        this.store.save({ ...fact, fact: op.fact, updatedAt: Date.now() })
        break
      }
    }
    this.changed(true)
    return this.read()
  }
}
