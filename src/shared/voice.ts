export const TTS_MODEL = 'sonic-3.6'
export const STT_MODEL = 'ink-2'
export const AUDIO_RATE = 24000
export const VOICE_TONES = ['neutral', 'calm', 'happy', 'excited', 'sad'] as const
export type VoiceTone = (typeof VOICE_TONES)[number]
export interface VoiceSettings {
  voiceId: string
  speed: number
  volume: number
  tone: VoiceTone
  microphoneId: string
}
export const DEFAULT_VOICE: VoiceSettings = {
  voiceId: 'db6b0ed5-d5d3-463d-ae85-518a07d3c2b4',
  speed: 1,
  volume: 1,
  tone: 'neutral',
  microphoneId: 'default'
}
export interface PresetVoice {
  id: string
  name: string
  language: string
  description: string
}
export interface SpeechRequest {
  id: string
  revision: number
  text: string
  origin: 'speak' | 'preview'
  settings: VoiceSettings
}
export type VoiceEvent =
  | {
      type: 'listening'
      session: string
      status: 'connecting' | 'listening' | 'error'
      message?: string
    }
  | { type: 'transcript'; session: string; id: string; text: string; final: boolean }
  | { type: 'audio'; id: string; samples: Uint8Array }
  | { type: 'speech'; id: string; status: 'generating' | 'generated' | 'failed'; message?: string }
export interface VoiceApi {
  status(): Promise<{ configured: boolean; settings: VoiceSettings }>
  voices(): Promise<PresetVoice[]>
  saveSettings(settings: VoiceSettings): Promise<void>
  listen(session: string, sampleRate: number): Promise<void>
  audio(session: string, samples: ArrayBuffer): void
  endListening(session: string): void
  speak(request: SpeechRequest): Promise<void>
  stop(id: string): void
  onEvent(listener: (event: VoiceEvent) => void): () => void
}
export function validVoiceSettings(value: unknown): value is VoiceSettings {
  if (!value || typeof value !== 'object') return false
  const s = value as VoiceSettings
  return (
    typeof s.voiceId === 'string' &&
    /^[\w-]{1,100}$/.test(s.voiceId) &&
    Number.isFinite(s.speed) &&
    s.speed >= 0.6 &&
    s.speed <= 1.5 &&
    Number.isFinite(s.volume) &&
    s.volume >= 0 &&
    s.volume <= 1 &&
    VOICE_TONES.includes(s.tone) &&
    typeof s.microphoneId === 'string' &&
    s.microphoneId.length <= 256
  )
}
export function validSpeechRequest(value: unknown): value is SpeechRequest {
  if (!value || typeof value !== 'object') return false
  const r = value as SpeechRequest
  return (
    typeof r.id === 'string' &&
    /^[\w-]{1,100}$/.test(r.id) &&
    Number.isSafeInteger(r.revision) &&
    r.revision >= 0 &&
    typeof r.text === 'string' &&
    !!r.text.trim() &&
    r.text.length <= 2000 &&
    // Cartesia interprets angle-bracket tags as provider controls. Reject, never rewrite.
    !/[<>]/.test(r.text) &&
    ['speak', 'preview'].includes(r.origin) &&
    validVoiceSettings(r.settings)
  )
}
