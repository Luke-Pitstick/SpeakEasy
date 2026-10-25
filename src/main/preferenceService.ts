import { randomUUID } from 'node:crypto'
import { PreferenceStore } from './preferenceStore'
import { extractPreferences } from './preferenceProvider'
import { diagnostics } from './diagnosticStore'
import {
  preferenceOperationSchema,
  type PreferenceFields,
  type PreferenceOperation,
  type PreferenceSnapshot,
  type ApprovedPreference,
  type SentenceMemory
} from '../shared/preferences'
import { lexicalWords } from '../shared/predictionValidation'

type LearningJob = {
  source: SentenceMemory
  conversation: { speaker: 'me' | 'partner'; text: string }[]
  done: () => void
}
const slot = (fact: PreferenceFields): string =>
  JSON.stringify([fact.relationship, fact.scope.game, fact.scope.topic])
    .normalize('NFKC')
    .toLowerCase()

export class PreferenceService {
  private queue: LearningJob[] = []
  private active: AbortController | null = null
  private activeSource: string | null = null
  private processing = false
  private closed = false
  private epoch = 0
  private lastCommitAt: number
  private error = ''
  constructor(
    private store: PreferenceStore,
    private key: string,
    private changed: (invalidate?: boolean, automatic?: boolean) => void,
    private canLearn: () => boolean,
    private fetcher: typeof fetch = fetch
  ) {
    this.lastCommitAt = Math.max(0, ...store.sentences().map((s) => s.createdAt))
    // Let the IPC owner finish installation before broadcasting recovered work.
    queueMicrotask(() => this.resume(true))
  }
  read(): PreferenceSnapshot {
    return {
      ...this.store.settings(),
      learning: !!this.key && this.canLearn(),
      facts: this.store.facts(),
      sentences: this.store.sentences(),
      busy: this.processing || this.queue.length > 0,
      error: this.error
    }
  }
  cancel(): void {
    this.epoch++
    this.active?.abort()
    for (const job of this.queue.splice(0)) job.done()
  }
  close(): void {
    this.closed = true
    this.cancel()
    this.store.close()
  }
  resume(retryFailed = false): void {
    if (this.closed || !this.key || !this.canLearn()) return
    for (const source of this.store.pendingLearning(retryFailed)) {
      if (this.activeSource === source.id || this.queue.some((job) => job.source.id === source.id))
        continue
      void this.learn(source, this.store.learningContext(source.id))
    }
  }
  private learn(source: SentenceMemory, conversation: LearningJob['conversation']): Promise<void> {
    if (!this.key || !this.canLearn()) {
      diagnostics.record('memory', {
        stage: 'write',
        outcome: 'generation-disabled',
        sourceId: source.id
      })
      return Promise.resolve()
    }
    this.store.setLearningStatus(source.id, 'pending')
    return new Promise((done) => {
      this.queue.push({ source, conversation, done })
      void this.drain()
    })
  }
  private async drain(): Promise<void> {
    if (this.processing || this.closed) return
    this.processing = true
    this.changed()
    try {
      while (this.queue.length && !this.closed) {
        const job = this.queue.shift()!
        const controller = new AbortController(),
          epoch = this.epoch
        this.active = controller
        this.activeSource = job.source.id
        let written = false
        try {
          if (!this.canLearn() || !this.store.sentences().some((s) => s.id === job.source.id))
            continue
          const extracted = await extractPreferences(
            this.key,
            job.source,
            job.conversation,
            controller.signal,
            this.fetcher
          )
          if (controller.signal.aborted || epoch !== this.epoch || !this.canLearn() || this.closed)
            continue
          if (!this.store.sentences().some((s) => s.id === job.source.id)) continue
          const saved: ApprovedPreference[] = []
          for (const proposal of extracted) {
            const existing = this.store.facts().find((f) => slot(f.fact) === slot(proposal.fact))
            // Retrying an old source must not overwrite a newer user assertion.
            if (existing && existing.source.createdAt > job.source.createdAt) continue
            const id = existing?.id ?? randomUUID()
            saved.push({ ...proposal, id, source: job.source, updatedAt: Date.now() })
          }
          this.store.completeLearning(job.source.id, saved)
          written = saved.length > 0
          diagnostics.record('memory', {
            stage: 'write',
            outcome: saved.length ? 'saved' : 'no-grounded-preference',
            sourceId: job.source.id,
            facts: saved.map(({ id, fact }) => ({ id, fact }))
          })
        } catch {
          if (!controller.signal.aborted) {
            this.store.setLearningStatus(job.source.id, 'failed')
            this.error =
              'Sentence saved, but automatic memory learning failed. Retry learning on the saved sentence.'
            diagnostics.record('memory', {
              stage: 'write',
              outcome: 'failed',
              sourceId: job.source.id
            })
          }
        } finally {
          if (this.active === controller) {
            this.active = null
            this.activeSource = null
          }
          job.done()
          if (!this.closed) this.changed(written, true)
        }
      }
    } finally {
      this.processing = false
      if (!this.closed) {
        this.changed()
        this.resume()
      }
    }
  }
  async update(input: PreferenceOperation): Promise<PreferenceSnapshot> {
    const op = preferenceOperationSchema.parse(input)
    this.error = ''
    if (op.type === 'commit') {
      this.lastCommitAt = Math.max(Date.now(), this.lastCommitAt + 1)
      const source: SentenceMemory = {
        id: op.id,
        text: op.text,
        initials: lexicalWords(op.text)
          .map((word) => word[0])
          .join(''),
        createdAt: this.lastCommitAt
      }
      if (this.store.commit(source, op.conversation, !!this.key && this.canLearn()))
        void this.learn(source, op.conversation)
      this.changed()
      return this.read()
    }
    if (op.type === 'extract') {
      const source = this.store.sentences().find((s) => s.id === op.id)
      if (!source) throw Error('Saved sentence no longer exists')
      if (!this.key || !this.canLearn())
        throw Error('Enable Gemini to learn from this saved sentence')
      await this.learn(source, this.store.learningContext(source.id))
      return this.read()
    }
    if (op.type !== 'settings') this.cancel()
    switch (op.type) {
      case 'settings':
        this.store.configure(op.retrieve)
        break
      case 'forget':
        this.store.forget(op.id)
        break
      case 'forget-sentences':
        this.store.forgetSentences(op.ids)
        break
      case 'clear':
        this.store.clear()
        break
      case 'edit': {
        const fact = this.store.facts().find((f) => f.id === op.id)
        if (!fact) throw Error('Fact no longer exists')
        if (this.store.facts().some((f) => f.id !== op.id && slot(f.fact) === slot(op.fact)))
          throw Error('Another fact already uses this preference topic')
        this.store.save({ ...fact, fact: op.fact, updatedAt: Date.now() })
        this.store.setLearningStatus(fact.source.id, 'completed')
        break
      }
    }
    this.changed(true)
    this.resume()
    return this.read()
  }
}
