import type { DiagnosticsApi } from '../shared/diagnostics'
import type { ToneApi } from '../shared/tone'
import type { VoiceApi } from '../shared/voice'
import type { GeminiApi } from '../shared/prediction'
import type { SettingsApi } from '../shared/settings'
import type { MemoryApi } from '../shared/memory'
import type { PreferenceApi } from '../shared/preferences'
declare global {
  interface Window {
    tone?: ToneApi
    diagnostics?: DiagnosticsApi
    preferences?: PreferenceApi
    memory?: MemoryApi
    settings?: SettingsApi
    gemini?: GeminiApi
    voice?: VoiceApi
  }
}
