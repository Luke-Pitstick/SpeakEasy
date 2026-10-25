import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  approvedPreferenceSchema,
  preferenceOperationSchema,
  sentenceSchema,
  type ApprovedPreference,
  type SentenceMemory
} from '../shared/preferences'

export type LearningContext = { speaker: 'me' | 'partner'; text: string }[]

export class PreferenceStore {
  private db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec(`PRAGMA secure_delete = ON;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, retrieve INTEGER NOT NULL);
      INSERT OR IGNORE INTO settings (id, retrieve) VALUES (1, 0);
      CREATE TABLE IF NOT EXISTS sentences (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sentence_learning (
        source_id TEXT PRIMARY KEY, conversation TEXT NOT NULL, status TEXT NOT NULL
      );`)
  }
  close(): void {
    this.db.close()
  }
  settings(): { retrieve: boolean } {
    const row = this.db.prepare('SELECT * FROM settings WHERE id = 1').get()!
    return { retrieve: !!row.retrieve }
  }
  configure(retrieve: boolean): void {
    this.db.prepare('UPDATE settings SET retrieve = ? WHERE id = 1').run(Number(retrieve))
  }
  sentences(): SentenceMemory[] {
    return this.db
      .prepare('SELECT data FROM sentences ORDER BY rowid DESC')
      .all()
      .map((r) => sentenceSchema.parse(JSON.parse(String(r.data))))
  }
  commit(sentence: SentenceMemory, conversation: LearningContext = [], learn = false): boolean {
    const value = sentenceSchema.parse(sentence)
    if (this.db.prepare('SELECT id FROM sentences WHERE id = ?').get(value.id)) return false
    if (this.sentences().length >= 2000)
      throw Error('Sentence memory is full. Forget saved sentences before saving more.')
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO sentences VALUES (?, ?)').run(value.id, JSON.stringify(value))
      this.db
        .prepare('INSERT INTO sentence_learning VALUES (?, ?, ?)')
        .run(value.id, JSON.stringify(conversation), learn ? 'pending' : 'completed')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return true
  }
  learningContext(id: string): LearningContext {
    const row = this.db
      .prepare('SELECT conversation FROM sentence_learning WHERE source_id = ?')
      .get(id)
    if (!row) return []
    const operation = preferenceOperationSchema.parse({
      type: 'commit',
      id,
      text: 'context',
      conversation: JSON.parse(String(row.conversation))
    })
    return operation.type === 'commit' ? operation.conversation : []
  }
  pendingLearning(retryFailed = false): SentenceMemory[] {
    const ids = new Set(
      this.db
        .prepare('SELECT source_id FROM sentence_learning WHERE status = ? OR status = ?')
        .all('pending', retryFailed ? 'failed' : 'pending')
        .map((row) => String(row.source_id))
    )
    return this.sentences()
      .filter((source) => ids.has(source.id))
      .reverse()
  }
  setLearningStatus(id: string, status: 'pending' | 'failed' | 'completed'): void {
    this.db
      .prepare(
        'INSERT INTO sentence_learning VALUES (?, ?, ?) ON CONFLICT(source_id) DO UPDATE SET status = excluded.status'
      )
      .run(id, '[]', status)
  }
  completeLearning(id: string, facts: ApprovedPreference[]): void {
    // A crash must leave either the complete result or a resumable job.
    this.db.exec('BEGIN')
    try {
      for (const fact of facts) this.save(fact)
      this.setLearningStatus(id, 'completed')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  facts(): ApprovedPreference[] {
    return this.db
      .prepare('SELECT data FROM facts ORDER BY rowid DESC')
      .all()
      .map((r) => approvedPreferenceSchema.parse(JSON.parse(String(r.data))))
  }
  save(fact: ApprovedPreference): void {
    const value = approvedPreferenceSchema.parse(fact)
    if (this.facts().length >= 200 && !this.facts().some((f) => f.id === value.id))
      throw Error('Fact memory is full. Forget a fact before adding more.')
    this.db
      .prepare('INSERT OR REPLACE INTO facts VALUES (?, ?)')
      .run(value.id, JSON.stringify(value))
  }

  forget(id: string): void {
    const fact = this.facts().find((fact) => fact.id === id)
    if (fact) this.setLearningStatus(fact.source.id, 'completed')
    this.db.prepare('DELETE FROM facts WHERE id = ?').run(id)
  }
  forgetSentences(ids: string[]): void {
    this.db.exec('BEGIN')
    try {
      for (const fact of this.facts()) if (ids.includes(fact.source.id)) this.forget(fact.id)
      for (const id of ids) {
        this.db.prepare('DELETE FROM sentence_learning WHERE source_id = ?').run(id)
        this.db.prepare('DELETE FROM sentences WHERE id = ?').run(id)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  clear(): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec(
        'DELETE FROM facts; DELETE FROM sentences; DELETE FROM sentence_learning; COMMIT'
      )
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
