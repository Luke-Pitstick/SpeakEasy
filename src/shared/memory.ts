import { lexicalWords } from './predictionValidation'
import type { PreferenceFields } from './preferences'

export interface Correction {
  before: string
  after: string
}
export interface CorrectionMemory extends Correction {
  id: string
  createdAt: number
}
export interface MemorySnapshot {
  learning: boolean
  cloud: boolean
  revision: number
  records: CorrectionMemory[]
  forgottenWords: string[]
  error?: string
}
export type MemoryOperation =
  | { type: 'learn'; id: string; correction: Correction }
  | { type: 'forget'; ids: string[] }
  | { type: 'forget-word'; word: string }
  | { type: 'clear' }
  | { type: 'edit'; id: string; text: string }
  | { type: 'settings'; learning: boolean; cloud: boolean }
export interface MemoryApi {
  read(): Promise<MemorySnapshot>
  update(operation: MemoryOperation): Promise<MemorySnapshot>
  onChanged(listener: (invalidate: boolean) => void): () => void
}
export interface MemoryContext {
  facts?: PreferenceFields[]
  vocabulary: string[]
  examples: { initials: string; text: string }[]
}
export const emptyMemory = (): MemoryContext => ({ vocabulary: [], examples: [] })
export function validMemoryWord(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 500 &&
    /^[\p{L}\p{N}]+(?:['’‘-][\p{L}\p{N}]+)*$/u.test(value)
  )
}
export function memoryWordKey(word: string): string {
  return lexicalWords(word)[0]
}
export function rememberedWords(correction: Correction, forgottenWords: string[]): string[] {
  const forgotten = new Set(forgottenWords)
  return correctedWords(correction).filter((word) => !forgotten.has(memoryWordKey(word)))
}
export function memoryVocabulary(
  records: CorrectionMemory[],
  forgottenWords: string[]
): { key: string; word: string; corrections: number; lastCorrected: number }[] {
  const words = new Map<
    string,
    { key: string; word: string; corrections: number; lastCorrected: number }
  >()
  for (const record of records) {
    const seen = new Set<string>()
    for (const word of rememberedWords(record, forgottenWords)) {
      const key = memoryWordKey(word)
      if (seen.has(key)) continue
      seen.add(key)
      const previous = words.get(key)
      words.set(key, {
        key,
        word: !previous || record.createdAt > previous.lastCorrected ? word : previous.word,
        corrections: (previous?.corrections ?? 0) + 1,
        lastCorrected: Math.max(previous?.lastCorrected ?? 0, record.createdAt)
      })
    }
  }
  return [...words.values()].sort((a, b) => a.key.localeCompare(b.key))
}
export function memoryExampleAllowed(correction: Correction, forgottenWords: string[]): boolean {
  const words = new Set(lexicalWords(correction.after))
  return !forgottenWords.some((word) => words.has(word))
}
export function validCorrection(value: unknown): value is Correction {
  if (!value || typeof value !== 'object') return false
  const c = value as Correction
  return (
    [c.before, c.after].every(
      (text) =>
        typeof text === 'string' &&
        text.trim().length > 0 &&
        text.length <= 500 &&
        ![...text].some((c) => c.charCodeAt(0) < 32)
    ) &&
    c.before !== c.after &&
    correctedWords(c).length > 0
  )
}
/** LCS keeps insertions/deletions from turning unchanged neighboring words into corrections. */
export function correctedWords({ before, after }: Correction): string[] {
  const originalExact = before.match(/[\p{L}\p{N}]+(?:['’‘-][\p{L}\p{N}]+)*/gu) ?? []
  const original = originalExact.map((word) => lexicalWords(word)[0])
  const exact = after.match(/[\p{L}\p{N}]+(?:['’‘-][\p{L}\p{N}]+)*/gu) ?? []
  const corrected = exact.map((word) => lexicalWords(word)[0])
  const lengths = Array.from({ length: original.length + 1 }, () =>
    Array<number>(corrected.length + 1).fill(0)
  )
  for (let i = original.length - 1; i >= 0; i--)
    for (let j = corrected.length - 1; j >= 0; j--)
      lengths[i][j] =
        original[i] === corrected[j]
          ? 1 + lengths[i + 1][j + 1]
          : Math.max(lengths[i + 1][j], lengths[i][j + 1])
  const changed: string[] = []
  let i = 0,
    j = 0
  while (j < corrected.length) {
    if (i < original.length && original[i] === corrected[j]) {
      if (originalExact[i] !== exact[j]) changed.push(exact[j])
      i++
      j++
    } else if (i < original.length && lengths[i + 1][j] > lengths[i][j + 1]) i++
    else changed.push(exact[j++])
  }
  return [...new Set(changed)]
}
