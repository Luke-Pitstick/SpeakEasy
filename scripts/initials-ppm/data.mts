import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { canonicalText, wordInitials } from '../../src/shared/initialsPpm.ts'

export type Source = 'aac' | 'turk' | 'comm2'
export type Split = 'train' | 'dev' | 'test'
export interface Message {
  id: string
  group: string
  source: Source
  split: Split
  textKey: string
  initialKey: string
  segments: string[]
  barriers: number
}
export const cacheDirectory = join(process.cwd(), '.cache/initials-ppm')
export const outputDirectory = join(process.cwd(), 'artifacts/initials-ppm')
export const hash = (value: string | Buffer): string =>
  createHash('sha256').update(value).digest('hex')
export const readJson = <T,>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T
export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
}

const sources = [
  {
    id: 'aac-train',
    url: 'https://aactext.org/imagine/aac_comm/sent_train_aac.txt',
    stage: 'prepare',
    sha256: 'ddc0ad61652cec5f4a8b76f1dd63f92fa9d5c1197e0a65f7a13d71873aed91bd'
  },
  {
    id: 'aac-dev',
    url: 'https://aactext.org/imagine/aac_comm/sent_dev_aac.txt',
    stage: 'prepare',
    sha256: 'ea15844416675800787f13767b3ab94d982a656094ee1865692af7947e8ad524'
  },
  {
    id: 'turk',
    url: 'https://aactext.org/turk/turk/turk-dialogues.txt',
    stage: 'prepare',
    sha256: '7bd80a8a8fe1e3ee91158072b4adc198db691f96196b27acf28ea8335507dafb'
  },
  { id: 'aac-page', url: 'https://aactext.org/imagine/', stage: 'prepare' },
  { id: 'turk-page', url: 'https://aactext.org/turk/', stage: 'prepare' },
  { id: 'comm2-page', url: 'https://aactext.org/comm2/', stage: 'prepare' },
  { id: 'aac-readme', url: 'https://aactext.org/imagine/aac_comm/readme.txt', stage: 'prepare' },
  { id: 'turk-readme', url: 'https://aactext.org/turk/turk/readme.txt', stage: 'prepare' },
  { id: 'comm2-readme', url: 'https://aactext.org/comm2/comm2/readme.txt', stage: 'prepare' },
  { id: 'aac-test', url: 'https://aactext.org/imagine/aac_comm/sent_test_aac.txt', stage: 'test' },
  { id: 'comm2', url: 'https://aactext.org/comm2/comm2/comm2.txt', stage: 'test' }
] as const

export interface Acquisition {
  id: string
  url: string
  sha256: string
  bytes: number
  acquiredAt: string
}

/** Curl handles the source host's HTTP policy; no shell or downloaded code is executed. */
export function acquire(stage: 'prepare' | 'test'): Acquisition[] {
  mkdirSync(cacheDirectory, { recursive: true })
  const lockPath = join(cacheDirectory, 'sources.json')
  const locked = existsSync(lockPath) ? readJson<Acquisition[]>(lockPath) : []
  for (const source of sources.filter((s) => s.stage === stage)) {
    const path = join(cacheDirectory, source.id + '.txt')
    const previous = locked.find((s) => s.id === source.id)
    if (!existsSync(path)) {
      execFileSync('curl', ['-fsSL', '--retry', '2', '--max-time', '45', source.url, '-o', path], {
        stdio: 'pipe'
      })
    }
    const raw = readFileSync(path)
    const digest = hash(raw)
    const expected = 'sha256' in source ? source.sha256 : previous?.sha256
    if (expected && expected !== digest) throw new Error(`Source hash changed: ${source.id}`)
    if (
      !raw.length ||
      (/^\s*<!doctype html|^\s*<html/i.test(raw.toString()) && !source.id.endsWith('-page'))
    )
      throw new Error(`Empty or unexpected HTML source: ${source.id}`)
    if (!previous)
      locked.push({
        id: source.id,
        url: source.url,
        sha256: digest,
        bytes: raw.length,
        acquiredAt: new Date().toISOString()
      })
    writeJson(lockPath, locked)
  }
  return locked
}

function message(id: string, group: string, source: Source, split: Split, text: string): Message {
  if (!text.trim()) throw new Error(`Empty source message: ${source}/${id}`)
  const { segments, barriers } = wordInitials(text)
  return {
    id,
    group,
    source,
    split,
    textKey: canonicalText(text),
    initialKey: segments.join('|'),
    segments,
    barriers
  }
}

export function parseAac(text: string, split: Split): Message[] {
  return text
    .split(/\r?\n/)
    .flatMap((line, index) =>
      line.trim()
        ? [message(`aac:${split}:${index}`, `aac:${split}:${index}`, 'aac', split, line)]
        : []
    )
}

export function parseTurk(text: string): Message[] {
  const lines = text.trimEnd().split(/\r?\n/)
  if (lines.shift() !== 'set\tid\tturn1\tturn2\tturn3\tturn4\tturn5\tturn6')
    throw new Error('Unexpected Turk header')
  const ids = new Set<string>()
  return lines.flatMap((line, row) => {
    const [split, id, ...turns] = line.split('\t')
    if (!['train', 'dev', 'test'].includes(split) || !id || turns.length !== 6 || ids.has(id))
      throw new Error(`Invalid Turk schema or duplicate dialogue ID at row ${row + 2}`)
    ids.add(id)
    return turns.map((turn, i) =>
      message(`turk:${id}:${i}`, `turk:${id}`, 'turk', split as Split, turn)
    )
  })
}

export function parseComm2(text: string): Message[] {
  const ids = new Set<string>()
  return text
    .trimEnd()
    .split(/\r?\n/)
    .map((line, row) => {
      const cells = line.split('\t')
      if (cells.length !== 2 || !cells[0] || ids.has(cells[0]))
        throw new Error(`Invalid COMM2 schema or duplicate ID at row ${row + 1}`)
      ids.add(cells[0])
      // No worker/scenario grouping is asserted from an undocumented ID.
      return message(`comm2:${cells[0]}`, `comm2:${cells[0]}`, 'comm2', 'test', cells[1])
    })
}

export function loadMessages(final = false): Message[] {
  const read = (id: string): string => readFileSync(join(cacheDirectory, id + '.txt'), 'utf8')
  const messages = [
    ...parseAac(read('aac-train'), 'train'),
    ...parseAac(read('aac-dev'), 'dev'),
    ...parseTurk(read('turk'))
  ]
  if (final) messages.push(...parseAac(read('aac-test'), 'test'), ...parseComm2(read('comm2')))
  return messages
}

export interface TrainingKeys {
  text: Set<string>
  initials: Set<string>
}
export function trainingKeys(messages: Message[]): TrainingKeys {
  const train = messages.filter((m) => m.split === 'train')
  return {
    text: new Set(train.map((m) => m.textKey)),
    initials: new Set(train.map((m) => m.initialKey))
  }
}

export function dataSummary(messages: Message[], keys: TrainingKeys): unknown[] {
  const groups = new Map<string, Message[]>()
  for (const m of messages) {
    const key = `${m.source}/${m.split}`
    const bucket = groups.get(key) ?? []
    bucket.push(m)
    groups.set(key, bucket)
  }
  return [...groups].map(([split, rows]) => ({
    split,
    messages: rows.length,
    groups: new Set(rows.map((m) => m.group)).size,
    targets: rows.reduce((n, m) => n + m.segments.join('').length, 0),
    barriers: rows.reduce((n, m) => n + m.barriers, 0),
    empty: rows.filter((m) => !m.segments.length).length,
    uniqueTexts: new Set(rows.map((m) => m.textKey)).size,
    textOverlapWithTrain: rows.filter((m) => keys.text.has(m.textKey)).length,
    initialOverlapWithTrain: rows.filter((m) => keys.initials.has(m.initialKey)).length
  }))
}
