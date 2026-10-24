import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_VOICE, validSpeechRequest, validVoiceSettings } from '../src/shared/voice'
import { streamSpeech, createCartesia } from '../src/main/cartesia'
const request = {
  id: 'utterance-1',
  revision: 2,
  text: 'I would like tea.',
  origin: 'speak' as const,
  settings: { ...DEFAULT_VOICE }
}

describe('voice provider boundary', () => {
  it('rejects provider markup and invalid settings without changing the intended text', () => {
    expect(validSpeechRequest(request)).toBe(true)
    expect(validSpeechRequest({ ...request, text: '<speed ratio="1.5"/>hello' })).toBe(false)
    expect(validSpeechRequest({ ...request, origin: 'model' })).toBe(false)
    expect(validVoiceSettings({ ...DEFAULT_VOICE, speed: NaN })).toBe(false)
    expect(validVoiceSettings({ ...DEFAULT_VOICE, volume: 2 })).toBe(false)
  })
  it('passes exact confirmed text and explicit neutral tone, ignoring chunks after cancellation', async () => {
    const controller = new AbortController(),
      audio = vi.fn()
    async function* events(): AsyncGenerator<{ type: string; data?: string }> {
      yield {
        type: 'chunk',
        data: Buffer.from(new Float32Array([0.1, 0.2]).buffer).toString('base64')
      }
      controller.abort()
      yield { type: 'chunk', data: Buffer.from(new Float32Array([0.3]).buffer).toString('base64') }
    }
    const generateSSE = vi.fn().mockResolvedValue(events())
    const client = { tts: { generateSSE } } as unknown as ReturnType<typeof createCartesia>
    await streamSpeech(client, request, controller.signal, audio)
    expect(audio).toHaveBeenCalledTimes(1)
    expect(generateSSE.mock.calls[0][0]).toMatchObject({
      transcript: request.text,
      model_id: 'sonic-3.6',
      generation_config: { emotion: 'neutral', speed: 1 }
    })
    expect(generateSSE.mock.calls[0][1].signal).toBe(controller.signal)
  })
  it('reports an empty provider stream as failure rather than completed speech', async () => {
    async function* events(): AsyncGenerator<{ type: string; data?: string }> {
      yield { type: 'done' }
    }
    const client = {
      tts: { generateSSE: vi.fn().mockResolvedValue(events()) }
    } as unknown as ReturnType<typeof createCartesia>
    await expect(
      streamSpeech(client, request, new AbortController().signal, vi.fn())
    ).rejects.toThrow('No audio received')
  })
})
