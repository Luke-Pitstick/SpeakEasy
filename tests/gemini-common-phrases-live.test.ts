import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { streamGemini } from '../src/main/gemini'
import { lexicalWords } from '../src/shared/predictionValidation'
import {
  EXPANSION_MODEL,
  type PredictionRequest,
  type PredictionResult
} from '../src/shared/prediction'

// Explicit opt-in: paid live requests with synthetic context and no personal memory.
// Exact intended-phrase rank measures retrieval; other choices still need human review.
it.skipIf(process.env.SPEAKEASY_LIVE_QUALITY_TEST !== '1')(
  'includes common intended phrases in live initials expansions',
  async () => {
    const key =
      process.env.OPENROUTER_TOKEN || parseEnv(readFileSync('.env', 'utf8')).OPENROUTER_TOKEN
    if (!key) throw Error('Configure OPENROUTER_TOKEN for the live quality test')
    const model = process.env.SPEAKEASY_QUALITY_MODEL || EXPANSION_MODEL
    const scenarios = [
      ['greeting', 'hhwyd?', 'Hi, how was your day?', ''],
      ['greeting-repeat', 'hhwyd?', 'Hi, how was your day?', ''],
      ['greeting-with-context', 'hhwyd?', 'Hi, how was your day?', 'Hi! It is good to see you.'],
      ['check-in', 'hay?', 'How are you?', ''],
      ['morning', 'gm', 'Good morning', ''],
      ['goodnight', 'gn', 'Good night', ''],
      ['affection', 'ily', 'I love you', ''],
      ['gratitude', 'tysm', 'Thank you so much', 'I brought your favorite lunch.'],
      ['drink', 'iwac', 'I want a coffee', 'Would you like tea or coffee?'],
      ['help', 'cyhm?', 'Can you help me?', ''],
      ['break', 'inab', 'I need a break', ''],
      ['uncertainty', 'idk', "I don't know", 'Do you know when the delivery will arrive?'],
      ['boundary', 'idwt', "I don't want that", 'Would you like this?']
    ]
    const records: unknown[] = []
    for (const [id, initials, intended, context] of scenarios) {
      const request: PredictionRequest = {
        id,
        revision: 1,
        purpose: 'expansion',
        draft: '',
        lockedMessage: '',
        target: { start: 0, end: 0 },
        tokens: [...initials].map((value, i) => ({
          id: String(i),
          kind: value === '?' || value === '!' ? 'punctuation' : 'initial',
          value
        })),
        conversation: context ? [{ id: 'partner', speaker: 'partner', text: context }] : []
      }
      const results: PredictionResult[] = []
      await streamGemini(
        request,
        key,
        new AbortController().signal,
        (result) => results.push(result),
        fetch,
        undefined,
        [],
        model
      )
      const final = results.at(-1)
      const candidates = final?.status === 'success' ? final.candidates.map((c) => c.text) : []
      const intendedWords = lexicalWords(intended).join(' ')
      const index = candidates.findIndex((text) => lexicalWords(text).join(' ') === intendedWords)
      const rank = index < 0 ? null : index + 1
      const record = { id, initials, intended, context, rank, candidates, final }
      records.push(record)
      console.info('LIVE_COMMON_PHRASE', JSON.stringify(record))
      writeFileSync(
        '/tmp/speakeasy-common-phrases-live.json',
        JSON.stringify({ model, recordedAt: new Date().toISOString(), records }, null, 2)
      )
      expect.soft(final?.status, id).toBe('success')
      expect.soft(rank, `${id}: intended phrase absent`).not.toBeNull()
      if (id.startsWith('greeting') && rank !== null)
        expect.soft(rank, `${id}: greeting should rank among first three`).toBeLessThanOrEqual(3)
      if (initials.endsWith('?'))
        expect
          .soft(
            candidates.every((text) => text.endsWith('?')),
            id
          )
          .toBe(true)
    }
  },
  180000
)
