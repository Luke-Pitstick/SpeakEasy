import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  approvedPreferenceSchema,
  sentenceSchema,
  type ApprovedPreference,
  type SentenceMemory
} from '../shared/preferences'

export class PreferenceStore {
  private db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec(`PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, extract INTEGER NOT NULL, retrieve INTEGER NOT NULL);
      INSERT OR IGNORE INTO settings VALUES (1, 0, 0);
      CREATE TABLE IF NOT EXISTS sentences (id TEXT PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS facts (id TEXT PRIMARY KEY, data TEXT NOT NULL);`)
  }
  close(): void {
    this.db.close()
  }
  settings(): { extract: boolean; retrieve: boolean } {
    const row = this.db.prepare('SELECT * FROM settings WHERE id = 1').get()!
    return { extract: !!row.extract, retrieve: !!row.retrieve }
  }
  configure(extract: boolean, retrieve: boolean): void {
    this.db
      .prepare('UPDATE settings SET extract = ?, retrieve = ? WHERE id = 1')
      .run(Number(extract), Number(retrieve))
  }
  sentences(): SentenceMemory[] {
    return this.db
      .prepare('SELECT data FROM sentences ORDER BY rowid DESC')
      .all()
      .map((r) => sentenceSchema.parse(JSON.parse(String(r.data))))
  }
  commit(sentence: SentenceMemory): boolean {
    const value = sentenceSchema.parse(sentence)
    if (this.db.prepare('SELECT id FROM sentences WHERE id = ?').get(value.id)) return false
    if (this.sentences().length >= 2000)
      throw Error('Sentence memory is full. Forget saved sentences before saving more.')
    this.db.prepare('INSERT INTO sentences VALUES (?, ?)').run(value.id, JSON.stringify(value))
    return true
  }
  facts(): ApprovedPreference[] {
    return this.db
      .prepare('SELECT data FROM facts ORDER BY rowid DESC')
      .all()
      .map((r) => approvedPreferenceSchema.parse(JSON.parse(String(r.data))))
  }
  save(fact: ApprovedPreference, replaceId: string | null = null): void {
    const value = approvedPreferenceSchema.parse(fact)
    if (this.facts().length >= 200 && !replaceId && !this.facts().some((f) => f.id === value.id))
      throw Error('Fact memory is full. Forget a fact before adding more.')
    this.db.exec('BEGIN')
    try {
      if (replaceId) this.db.prepare('DELETE FROM facts WHERE id = ?').run(replaceId)
      this.db
        .prepare('INSERT OR REPLACE INTO facts VALUES (?, ?)')
        .run(value.id, JSON.stringify(value))
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  forget(id: string): void {
    this.db.prepare('DELETE FROM facts WHERE id = ?').run(id)
  }
  forgetSentences(ids: string[]): void {
    this.db.exec('BEGIN')
    try {
      for (const fact of this.facts()) if (ids.includes(fact.source.id)) this.forget(fact.id)
      for (const id of ids) this.db.prepare('DELETE FROM sentences WHERE id = ?').run(id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
  clear(): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec('DELETE FROM facts; DELETE FROM sentences; COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}
