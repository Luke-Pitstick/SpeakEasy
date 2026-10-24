import { DatabaseSync } from 'node:sqlite'
import { chmodSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  correctedWords,
  rememberedWords,
  memoryWordKey,
  memoryExampleAllowed,
  validMemoryWord,
  emptyMemory,
  validCorrection,
  type CorrectionMemory,
  type MemoryContext,
  type MemoryOperation,
  type MemorySnapshot
} from '../shared/memory'
import type { PredictionRequest } from '../shared/prediction'
import { lexicalWords } from '../shared/predictionValidation'

export class MemoryStore {
  private db: DatabaseSync
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    if (path !== ':memory:') chmodSync(path, 0o600)
    this.db.exec(`PRAGMA secure_delete = ON;
      CREATE TABLE IF NOT EXISTS policy (id INTEGER PRIMARY KEY CHECK (id = 1), learning INTEGER NOT NULL, cloud INTEGER NOT NULL, revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO policy VALUES (1, 0, 0, 0);
      CREATE TABLE IF NOT EXISTS corrections (id TEXT PRIMARY KEY, before TEXT NOT NULL, after TEXT NOT NULL, createdAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS forgotten_words (word TEXT PRIMARY KEY);`)
  }
  close(): void {
    this.db.close()
  }
  read(): MemorySnapshot {
    const policy = this.db.prepare('SELECT * FROM policy WHERE id = 1').get()!
    return {
      learning: !!policy.learning,
      cloud: !!policy.cloud,
      revision: Number(policy.revision),
      forgottenWords: this.db
        .prepare('SELECT word FROM forgotten_words')
        .all()
        .map((row) => String(row.word)),
      records: this.db
        .prepare('SELECT * FROM corrections ORDER BY createdAt DESC, id')
        .all() as unknown as CorrectionMemory[]
    }
  }
  update(operation: MemoryOperation): MemorySnapshot {
    this.db.exec('BEGIN')
    try {
      switch (operation.type) {
        case 'settings':
          this.db
            .prepare('UPDATE policy SET learning = ?, cloud = ? WHERE id = 1')
            .run(Number(operation.learning), Number(operation.cloud))
          break
        case 'learn':
          if (!validCorrection(operation.correction)) throw Error('Invalid correction')
          if (!this.read().learning) break
          if (this.db.prepare('SELECT id FROM corrections WHERE id = ?').get(operation.id)) break
          if (
            Number(this.db.prepare('SELECT count(*) AS count FROM corrections').get()!.count) >=
            2000
          )
            throw Error('Memory is full. Forget old corrections to learn more.')
          this.db
            .prepare('INSERT OR IGNORE INTO corrections VALUES (?, ?, ?, ?)')
            .run(operation.id, operation.correction.before, operation.correction.after, Date.now())
          for (const word of correctedWords(operation.correction))
            this.db.prepare('DELETE FROM forgotten_words WHERE word = ?').run(memoryWordKey(word))
          break
        case 'forget-word':
          if (!validMemoryWord(operation.word)) throw Error('Invalid memory word')
          this.db
            .prepare('INSERT OR IGNORE INTO forgotten_words VALUES (?)')
            .run(memoryWordKey(operation.word))
          break
        case 'forget':
          for (const id of operation.ids)
            this.db.prepare('DELETE FROM corrections WHERE id = ?').run(id)
          break
        case 'clear':
          this.db.exec('DELETE FROM corrections; DELETE FROM forgotten_words')
          break
        case 'edit': {
          const record = this.db
            .prepare('SELECT * FROM corrections WHERE id = ?')
            .get(operation.id) as unknown as CorrectionMemory | undefined
          if (!record) break
          if (validCorrection({ before: record.before, after: operation.text }))
            this.db
              .prepare('UPDATE corrections SET after = ?, createdAt = ? WHERE id = ?')
              .run(operation.text, Date.now(), operation.id)
          else this.db.prepare('DELETE FROM corrections WHERE id = ?').run(operation.id)
          break
        }
      }
      this.db.exec('UPDATE policy SET revision = revision + 1 WHERE id = 1; COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return this.read()
  }
  retrieve(request: PredictionRequest): MemoryContext {
    const snapshot = this.read()
    if (!snapshot.cloud || request.purpose !== 'expansion') return emptyMemory()
    return retrieveMemories(snapshot.records, request, snapshot.forgottenWords)
  }
}

const stop = new Set([
  'i',
  'a',
  'an',
  'the',
  'to',
  'is',
  'it',
  'and',
  'of',
  'in',
  'on',
  'we',
  'you',
  'my',
  'me',
  'want'
])
export function retrieveMemories(
  records: CorrectionMemory[],
  request: PredictionRequest,
  forgottenWords: string[] = []
): MemoryContext {
  const context = new Set(
    lexicalWords(
      [
        request.draft,
        ...request.tokens.filter((token) => token.kind === 'word').map((token) => token.value),
        request.lockedMessage || request.conversation.map((turn) => turn.text).join(' ')
      ].join(' ')
    ).filter((word) => !stop.has(word))
  )
  const overlap = (text: string): number =>
    [...new Set(lexicalWords(text))].filter((w) => context.has(w)).length
  const compatible = (word: string): number =>
    Math.max(
      0,
      ...request.tokens.map((t) => {
        const value = t.value.toLowerCase()
        return (t.kind === 'word' ? word === value : word.startsWith(value)) ? value.length : 0
      })
    )
  const words = new Map<string, { text: string; relevance: number; recent: number; uses: number }>()
  for (const record of records)
    for (const text of rememberedWords(record, forgottenWords)) {
      const key = lexicalWords(text)[0],
        match = compatible(key)
      if (!match || text.length > 60) continue
      const previous = words.get(key)
      const relevance =
        (match > 1 ? 100 : 0) +
        (context.has(key) ? 40 : 0) +
        Math.min(10, overlap(record.after)) * 2
      words.set(key, {
        text: !previous || record.createdAt >= previous.recent ? text : previous.text,
        relevance: Math.max(relevance, previous?.relevance ?? 0),
        recent: Math.max(record.createdAt, previous?.recent ?? 0),
        uses: (previous?.uses ?? 0) + 1
      })
    }
  const ranked = [...words.values()].sort(
    (a, b) =>
      b.relevance - a.relevance ||
      Math.floor((Date.now() - a.recent) / 86400000) -
        Math.floor((Date.now() - b.recent) / 86400000) ||
      b.uses - a.uses ||
      b.recent - a.recent
  )
  // Reserve one place for the newest eligible correction, even among frequent ties.
  const newest = [...words.values()].sort((a, b) => b.recent - a.recent)[0]
  const vocabulary = ranked.slice(0, 7).map((w) => w.text)
  if (newest && !vocabulary.includes(newest.text)) vocabulary.push(newest.text)
  const examples = records
    .filter((record) => memoryExampleAllowed(record, forgottenWords))
    .map((r) => {
      const ws = lexicalWords(r.after)
      const exact =
        ws.length === request.tokens.length &&
        request.tokens.every((t, i) =>
          t.kind === 'word'
            ? ws[i] === t.value.toLowerCase()
            : ws[i].startsWith(t.value.toLowerCase())
        )
      return { record: r, score: (exact ? 100 : 0) + overlap(r.after) }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || b.record.createdAt - a.record.createdAt)
  const result: MemoryContext = { vocabulary, examples: [] }
  for (const { record } of examples) {
    if (result.examples.some((e) => e.text === record.after)) continue
    const example = {
      initials: lexicalWords(record.after)
        .map((w) => w[0])
        .join(''),
      text: record.after
    }
    if (JSON.stringify({ ...result, examples: [...result.examples, example] }).length > 1800)
      continue
    result.examples.push(example)
    if (result.examples.length === 3) break
  }
  return result
}
