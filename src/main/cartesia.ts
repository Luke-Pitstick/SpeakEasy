import Cartesia from '@cartesia/cartesia-js'
import { AUDIO_RATE, TTS_MODEL, type SpeechRequest } from '../shared/voice'

export function createCartesia(apiKey: string): Cartesia {
  // A retry could repeat an utterance that was already heard.
  return new Cartesia({ apiKey, maxRetries: 0, timeout: 20000 })
}
export async function streamSpeech(
  client: Cartesia,
  request: SpeechRequest,
  signal: AbortSignal,
  audio: (samples: Uint8Array) => void
): Promise<void> {
  const stream = await client.tts.generateSSE(
    {
      model_id: TTS_MODEL,
      transcript: request.text,
      voice: { mode: 'id', id: request.settings.voiceId },
      output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: AUDIO_RATE },
      language: 'en',
      generation_config: { speed: request.settings.speed, emotion: request.settings.tone }
    },
    { signal }
  )
  let received = false
  for await (const event of stream) {
    if (signal.aborted) return
    if (event.type === 'error') throw new Error('Speech generation failed')
    if (event.type === 'chunk') {
      const bytes = Buffer.from(event.data, 'base64')
      if (bytes.length) {
        received = true
        audio(bytes)
      }
    }
  }
  if (!signal.aborted && !received) throw new Error('No audio received')
}
