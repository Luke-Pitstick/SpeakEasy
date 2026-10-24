import { ExpansionContextCache } from '../src/main/expansionContext'
import { diagnostics } from '../src/main/diagnosticStore'
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { streamGemini } from '../src/main/gemini'
import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'

it.skipIf(process.env.SPEAKEASY_LIVE_SCHOOL_TEST !== '1')(
  'uses tense and the school/math follow-up with real Gemini',
  async () => {
    const key =
      process.env.OPENROUTER_TOKEN || parseEnv(readFileSync('.env', 'utf8')).OPENROUTER_TOKEN
    if (!key) throw Error('OPENROUTER_TOKEN required')
    const contextCache = new ExpansionContextCache()
    const conversation: PredictionRequest['conversation'] = [
      {
        id: 'q1',
        speaker: 'partner',
        text: 'What was your least favorite subject when you were in school?'
      }
    ]
    for (const initials of ['idlm', 'ittitc']) {
      if (initials === 'ittitc')
        conversation.push(
          { id: 'a1', speaker: 'me', text: "I didn't like math." },
          { id: 'q2', speaker: 'partner', text: "What's wrong with math? It's not that hard." }
        )
      const request: PredictionRequest = {
        id: initials,
        revision: 1,
        purpose: 'expansion',
        draft: '',
        lockedMessage: '',
        target: { start: 0, end: 0 },
        conversation,
        tokens: [...initials].map((value, i) => ({ id: String(i), kind: 'initial', value }))
      }
      diagnostics.start({
        epoch: 0,
        revision: 1,
        draft: '',
        initials,
        lockedMessage: '',
        conversation: [],
        summary: '',
        pendingSummary: [],
        partial: '',
        queuedTranscripts: [],
        listening: '',
        paused: true,
        busy: false
      })
      const preparedContext = await contextCache.resolve(request, key, new AbortController().signal)
      console.info('Prepared context', JSON.stringify(preparedContext))
      expect(preparedContext).not.toBeNull()
      let result: PredictionResult | undefined
      await streamGemini(
        request,
        key,
        new AbortController().signal,
        (value) => {
          result = value
        },
        fetch,
        undefined,
        [],
        undefined,
        preparedContext
      )
      console.info(
        'Candidate trace',
        diagnostics
          .read()
          .events.filter((e) => e.kind === 'candidate')
          .map((e) => e.data)
      )
      diagnostics.stop()
      console.info('School context live result', JSON.stringify(result))
      expect(result?.status, JSON.stringify(result)).toBe('success')
      if (result?.status !== 'success') throw Error('No successful result')
      expect(result.candidates.length).toBeGreaterThanOrEqual(3)
      const text = result.candidates.map((c) => c.text.toLowerCase().replaceAll('’', "'"))
      if (initials === 'idlm') expect(text.some((t) => t.includes("i didn't like math"))).toBe(true)
      else expect(text.some((t) => t.includes('i think trigonometry is too confusing'))).toBe(true)
    }
  },
  60000
)
