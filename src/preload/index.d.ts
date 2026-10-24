import type { VoiceApi } from '../shared/voice'
import type { GeminiApi } from '../shared/prediction'
import type { SettingsApi } from '../shared/settings'
declare global {
  interface Window {
    settings?: SettingsApi
    gemini?: GeminiApi
    voice?: VoiceApi
  }
}
