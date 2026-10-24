import { expect, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { streamGemini } from '../src/main/gemini'
import {
  EXPANSION_MODEL,
  type PredictionRequest,
  type PredictionResult
} from '../src/shared/prediction'

// Explicit opt-in: sends synthetic conversations to the configured paid provider.
// Assertions check delivery and constraints; grammar and meaning require reviewing the output.
it.skipIf(process.env.SPEAKEASY_LIVE_QUALITY_TEST !== '1')(
  'records live initials expansions for grammar and expression review',
  async () => {
    const key =
      process.env.OPENROUTER_TOKEN || parseEnv(readFileSync('.env', 'utf8')).OPENROUTER_TOKEN
    if (!key) throw Error('Configure OPENROUTER_TOKEN for the live quality test')
    const model = process.env.SPEAKEASY_QUALITY_MODEL || EXPANSION_MODEL
    const scenarios = [
      ['drink', 'iwac', 'Would you like tea or coffee?'],
      ['uncertainty', 'idk', 'Do you know when the delivery will arrive?'],
      ['anticipation', 'icw', 'We got tickets to your favorite band tomorrow!'],
      ['frustration', 'tsf', 'The appointment was cancelled again after you waited all morning.'],
      ['affection', 'ily', 'I love you. I am glad we get to spend today together.'],
      ['gratitude', 'tysm', 'I fixed your chair and brought your favorite lunch.'],
      ['boundary', 'idwtdt', 'Would you like to go to the crowded party tonight?'],
      ['excited', 'isetsy', 'I will finally be visiting you this weekend after a year apart.'],
      [
        'excited-tight-constraints',
        'isety',
        'I will finally be visiting you this weekend after a year apart.'
      ],
      ['humor', 'wtwg', 'I tried to bake a cake and set off every smoke alarm in the house.'],
      ['longer', 'icbwdt', 'We finally finished that impossible puzzle together!'],
      ['practical', 'cypmtc', 'Are you comfortable, or should I adjust something?'],
      ['locked-contraction', 'idttagi', 'Should we leave without telling anyone?'],
      [
        'locked-contraction-tight-constraints',
        'idtasgi',
        'Should we leave without telling anyone?'
      ],
      ['prefix', 'iraat', 'I stayed late to help you finish the paperwork.'],
      ['no-context', 'ins', '']
    ]
    const records: unknown[] = []
    for (const [id, initials, context] of scenarios) {
      const request: PredictionRequest = {
        id,
        revision: 1,
        purpose: 'expansion',
        draft: '',
        lockedMessage: '',
        target: { start: 0, end: 0 },
        tokens: [...initials].map((value, i) => ({ id: String(i), kind: 'initial', value })),
        conversation: context ? [{ id: 'partner', speaker: 'partner', text: context }] : []
      }
      if (id.startsWith('locked-contraction'))
        request.tokens[1] = { id: '1', kind: 'word', value: "don't" }
      if (id === 'prefix') request.tokens[2] = { id: '2', kind: 'prefix', value: 'app' }
      const results: PredictionResult[] = []
      let rawResponse: Promise<string> | undefined
      const liveFetch: typeof fetch = async (url, init) => {
        const body = JSON.parse(String(init?.body))
        const response = await fetch(url, { ...init, body: JSON.stringify({ ...body, model }) })
        if (response.ok) rawResponse = response.clone().text()
        return response
      }
      await streamGemini(
        request,
        key,
        new AbortController().signal,
        (r) => results.push(r),
        liveFetch
      )
      const final = results.at(-1)
      const raw = rawResponse ? await rawResponse : ''
      const generated = raw
        .split('\n')
        .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
        .map((line) => JSON.parse(line.slice(6)).choices?.[0]?.delta?.content ?? '')
        .join('')
      const record = { id, initials, context, constraints: request.tokens, generated, final }
      records.push(record)
      console.info('LIVE_QUALITY', JSON.stringify(record))
      writeFileSync('/tmp/speakeasy-live-quality.json', JSON.stringify({ model, records }, null, 2))
      expect.soft(final?.status, id).toBe('success')
      if (final?.status === 'success') expect.soft(final.candidates.length, id).toBeGreaterThan(0)
    }
  },
  180000
)
