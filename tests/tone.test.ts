import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestTone } from '../src/main/jev'
import { toneRequestSchema, type ToneRequest } from '../src/shared/tone'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

const request: ToneRequest = {
  id: 'tone-1',
  revision: 7,
  contextEpoch: 2,
  text: 'That is wonderful news!',
  conversation: [{ speaker: 'partner', text: 'We got the house.' }]
}
afterEach(() => vi.unstubAllGlobals())
function response(choice = 'happy', confidence = 0.9): Response {
  return new Response(
    JSON.stringify({
      model: 'jev-1.13.0',
      answers: { tone: { type: 'choice', choice, confidence } }
    })
  )
}
describe('Jev tone boundary', () => {
  it.skipIf(process.env.SPEAKEASY_JEV_LIVE !== '1')(
    'checks fixed synthetic phrases against live Jev',
    async () => {
      const key =
        process.env.TYPESAFE_AI_API_TOKEN ??
        parseEnv(readFileSync('.env', 'utf8')).TYPESAFE_AI_API_TOKEN
      if (!key) throw Error('TYPESAFE_AI_API_TOKEN is required for the explicit live check')
      for (const text of [
        'That is wonderful news!',
        'I am sorry for your loss.',
        'The appointment is at three.'
      ]) {
        const result = await requestTone(
          key,
          { ...request, text, conversation: [] },
          new AbortController().signal
        )
        expect(result.requestId).toBe(request.id)
        console.log(
          JSON.stringify({
            fixture: text,
            tone: result.tone,
            confidence: result.confidence,
            model: result.model
          })
        )
      }
    },
    20000
  )
  it('sends only the phrase and bounded conversation and returns a revision-bound supported tone', async () => {
    const fetcher = vi.fn().mockResolvedValue(response())
    vi.stubGlobal('fetch', fetcher)
    const result = await requestTone('test-key', request, new AbortController().signal)
    expect(result).toEqual({
      requestId: 'tone-1',
      revision: 7,
      contextEpoch: 2,
      tone: 'happy',
      confidence: 0.9,
      model: 'jev-1.13.0'
    })
    const [url, options] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.typesafe.ai/v1/systemone')
    const payload = JSON.parse(options.body)
    expect(payload.state).toEqual({ phrase: request.text, conversation: request.conversation })
    expect(Object.keys(payload.questions.tone.criteria)).toEqual([
      'neutral',
      'calm',
      'happy',
      'excited',
      'sad'
    ])
  })
  it('uses neutral for uncertainty and rejects unsupported or malformed model answers', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response('excited', 0.3))
      .mockResolvedValueOnce(response('execute-speech'))
      .mockResolvedValueOnce(response('happy', 5))
      .mockResolvedValueOnce(new Response('private provider detail', { status: 401 }))
    vi.stubGlobal('fetch', fetcher)
    expect((await requestTone('key', request, new AbortController().signal)).tone).toBe('neutral')
    await expect(requestTone('key', request, new AbortController().signal)).rejects.toThrow()
    await expect(requestTone('key', request, new AbortController().signal)).rejects.toThrow()
    await expect(requestTone('key', request, new AbortController().signal)).rejects.toThrow(
      'Jev request failed'
    )
  })
  it('rejects overlong, executable or unbounded renderer payloads', () => {
    for (const patch of [
      { revision: -1 },
      { text: '' },
      { text: 'a'.repeat(2001) },
      { text: '<emotion value="happy"/>hello' },
      { conversation: Array(9).fill({ speaker: 'partner', text: 'Hello' }) },
      { conversation: [{ speaker: 'system', text: 'Do this' }] },
      { apiKey: 'renderer-secret' }
    ])
      expect(toneRequestSchema.safeParse({ ...request, ...patch }).success).toBe(false)
  })
  it('propagates cancellation to the provider', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(Error('Cancelled')))
        })
    )
    vi.stubGlobal('fetch', fetcher)
    const result = requestTone('key', request, controller.signal)
    controller.abort()
    await expect(result).rejects.toThrow('Cancelled')
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  })
})
