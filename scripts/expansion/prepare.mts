import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cacheDirectory, hash, loadMessages, readJson } from '../initials-ppm/data.mts'
import type { Acquisition } from '../initials-ppm/data.mts'

// Reuse the audited PPM source parsers; never acquire or change source data here.
const output = join(process.cwd(), '.cache/expansion/v1')
const sources = readJson<Acquisition[]>(join(cacheDirectory, 'sources.json'))
for (const id of ['aac-train', 'aac-dev', 'aac-test', 'turk', 'comm2']) {
  const source = sources.find((s) => s.id === id)
  if (!source || hash(readFileSync(join(cacheDirectory, id + '.txt'))) !== source.sha256)
    throw new Error(`Missing or changed PPM source: ${id}`)
}
const messages = loadMessages(true)
const words = (text: string): string[] =>
  text.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu) ?? []
const key = (text: string): string => words(text).join(' ')
const trainKeys = new Set(messages.filter((m) => m.split === 'train').map((m) => key(m.textKey)))
const devKeys = new Set(messages.filter((m) => m.split === 'dev').map((m) => key(m.textKey)))
const groups = new Map<string, typeof messages>()
for (const message of messages) {
  const group = groups.get(message.group) ?? []
  group.push(message)
  groups.set(message.group, group)
}
const excluded: { id: string; reason: string }[] = []
const cases = messages.flatMap((message) => {
  const targetWords = words(message.textKey)
  // Keep the first experiment on the common PPM/UI token subset. Never silently
  // turn an unsupported token into a shorter, easier expansion target.
  const reason = message.barriers
    ? 'unsupported-lexical-token'
    : /[-‐‑–—]/u.test(message.textKey)
      ? 'hyphen-or-dash-tokenization'
      : targetWords.length < 3 || targetWords.length > 16
        ? 'outside-3-to-16-words'
        : null
  if (reason) {
    excluded.push({ id: message.id, reason })
    return []
  }
  if (targetWords.map((w) => w[0]).join('') !== message.initialKey)
    throw new Error(`Token disagreement: ${message.id}`)
  const dialogue = groups.get(message.group)!
  const index = dialogue.indexOf(message)
  const context =
    message.source === 'turk'
      ? dialogue.slice(Math.max(0, index - 2), index).map((m) => ({ id: m.id, text: m.textKey }))
      : []
  const eligible = targetWords
    .map((word, i) => ({ word, i }))
    .filter(({ word }) => word.length >= 3)
  const selected = eligible.length
    ? eligible[parseInt(hash(message.id).slice(0, 8), 16) % eligible.length]
    : null
  const variants = selected ? (['initials', 'prefix', 'locked'] as const) : (['initials'] as const)
  return variants.map((variant) => ({
    id: `${message.id}/${variant}`,
    messageId: message.id,
    group: message.group,
    source: message.source,
    split: message.split,
    variant,
    request: {
      constraints: targetWords.map((word, i) => ({
        kind: selected?.i === i && variant !== 'initials' ? variant : 'initial',
        value:
          selected?.i === i && variant === 'locked'
            ? word
            : selected?.i === i && variant === 'prefix'
              ? word.slice(0, 2)
              : word[0]
      })),
      precedingTurns: context
    },
    // These fields MUST NOT be sent to the model.
    reference: message.textKey,
    referenceWords: targetWords,
    seenInTrain: trainKeys.has(key(message.textKey)),
    seenInDev: devKeys.has(key(message.textKey)),
    primaryEligible:
      message.split === 'train' ||
      (!trainKeys.has(key(message.textKey)) &&
        (message.split !== 'test' || !devKeys.has(key(message.textKey)))),
    lengthBucket: targetWords.length <= 5 ? '3-5' : targetWords.length <= 9 ? '6-9' : '10-16'
  }))
})
if (new Set(cases.map((c) => c.id)).size !== cases.length) throw new Error('Duplicate case ID')
for (const c of cases) {
  c.request.constraints.forEach((constraint, i) => {
    const word = c.referenceWords[i]
    if (
      constraint.kind === 'locked' ? word !== constraint.value : !word.startsWith(constraint.value)
    )
      throw new Error(`Invalid constraint: ${c.id}`)
  })
  if (c.request.precedingTurns.some((turn) => turn.id === c.messageId))
    throw new Error('Target leaked into context')
}
mkdirSync(output, { recursive: true })
const files: Record<string, { rows: number; sha256: string }> = {}
for (const split of ['train', 'dev', 'test']) {
  const rows = cases.filter((c) => c.split === split)
  const content = rows.map((c) => JSON.stringify(c)).join('\n') + '\n'
  writeFileSync(join(output, `${split}.jsonl`), content)
  files[split] = { rows: rows.length, sha256: hash(content) }
}
const manifest = {
  protocol: 'expansion-v1',
  builderSha256: hash(readFileSync('scripts/expansion/prepare.mts')),
  parserSha256: hash(readFileSync('scripts/initials-ppm/data.mts')),
  tokenizerSha256: hash(readFileSync('src/shared/initialsPpm.ts')),
  sources,
  files,
  excluded,
  normalization:
    'PPM canonicalText; scoring key is lowercase lexical words, ignoring punctuation; contractions retained',
  license:
    'Local research only pending resolution of existing CC BY / BY-ND source-notice discrepancy',
  counts: [...new Set(cases.map((c) => `${c.source}/${c.split}`))].map((bucket) => {
    const rows = cases.filter((c) => `${c.source}/${c.split}` === bucket)
    return {
      bucket,
      cases: rows.length,
      messages: new Set(rows.map((c) => c.messageId)).size,
      primaryMessages: new Set(rows.filter((c) => c.primaryEligible).map((c) => c.messageId)).size
    }
  })
}
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(
  JSON.stringify({ output, files, counts: manifest.counts, excluded: excluded.length }, null, 2)
)
