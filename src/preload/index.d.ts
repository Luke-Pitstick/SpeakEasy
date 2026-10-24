import type { VoiceApi } from '../shared/voice'
import type { GeminiApi } from '../shared/prediction'
declare global {
  interface Window {
    gemini?: GeminiApi
    voice?: VoiceApi
  }
}
