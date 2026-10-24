import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { CANDIDATE_LIMIT, type PhraseCandidate, type PredictionRequest } from '../shared/prediction'
import { cacheMatch, candidateFor, lexicalWords } from '../shared/predictionValidation'

interface Entry {
  initials: string
  text: string
  uses: number
  lastUsed: number
}
export class PhraseCache {
  private entries: Entry[] = []
  constructor(private readonly path: string) {
    try {
      const data: unknown = JSON.parse(readFileSync(path, 'utf8'))
      if (
        !Array.isArray(data) ||
        data.length > 2000 ||
        !data.every(
          (e) =>
            e &&
            validPhrase(e.initials, e.text) &&
            Number.isSafeInteger(e.uses) &&
            e.uses > 0 &&
            Number.isFinite(e.lastUsed)
        )
      )
        throw Error('Invalid phrase cache')
      this.entries = data
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  private write(entries: Entry[]): void {
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path + '.tmp', JSON.stringify(entries), { mode: 0o600 })
    renameSync(this.path + '.tmp', this.path)
    this.entries = entries
  }
  save(initials: string, text: string): void {
    if (!validPhrase(initials, text)) throw Error('Invalid spoken phrase')
    const key = lexicalWords(text).join(' ')
    const existing = this.entries.find(
      (e) => e.initials === initials && lexicalWords(e.text).join(' ') === key
    )
    this.write(
      [
        { initials, text: text.trim(), uses: (existing?.uses ?? 0) + 1, lastUsed: Date.now() },
        ...this.entries.filter((e) => e !== existing)
      ].slice(0, 2000)
    )
  }
  clear(): void {
    this.write([])
  }
  retract(initials: string, text: string): void {
    const key = lexicalWords(text).join(' ')
    const existing = this.entries.find(
      (e) => e.initials === initials && lexicalWords(e.text).join(' ') === key
    )
    if (!existing) return
    this.write(
      this.entries.flatMap((entry) =>
        entry !== existing ? [entry] : entry.uses > 1 ? [{ ...entry, uses: entry.uses - 1 }] : []
      )
    )
  }
  lookup(request: PredictionRequest): PhraseCandidate[] {
    const ranked = this.entries
      .map((entry) => ({ entry, score: cacheMatch(request, entry.text, entry.initials) }))
      .filter((item) => item.score !== null)
      .sort(
        (a, b) =>
          a.score! - b.score! || b.entry.uses - a.entry.uses || b.entry.lastUsed - a.entry.lastUsed
      )
    const candidates: PhraseCandidate[] = [],
      seen = new Set<string>()
    for (const { entry } of ranked) {
      const key = lexicalWords(entry.text).join(' ')
      const candidate = candidateFor(request, entry.text, candidates.length, entry.initials)
      if (!candidate || seen.has(key)) continue
      seen.add(key)
      candidates.push(candidate)
      if (candidates.length === CANDIDATE_LIMIT) break
    }
    return candidates
  }
}
export function validPhrase(initials: unknown, text: unknown): initials is string {
  return (
    typeof initials === 'string' &&
    /^[a-z]{1,24}$/.test(initials) &&
    typeof text === 'string' &&
    text.trim().length > 0 &&
    text.length <= 500 &&
    !/[<>`]/.test(text) &&
    ![...text].some((c) => c.charCodeAt(0) < 32) &&
    lexicalWords(text).length > 0
  )
}
