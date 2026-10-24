import { EXPANSION_MODEL, validModelId } from './prediction'

export interface AppSettings {
  phraseModel: string
  theme: 'system' | 'light' | 'dark'
  speed: number
  edgeHeight: number
  weighting: 'uniform' | 'ppm'
  showGazeDot: boolean
  dwell: boolean
  duration: number
  geminiEnabled: boolean
}

export const DEFAULT_SETTINGS: AppSettings = {
  phraseModel: EXPANSION_MODEL,
  theme: 'system',
  speed: 0.6,
  edgeHeight: 48,
  weighting: 'ppm',
  showGazeDot: true,
  dwell: true,
  duration: 1000,
  geminiEnabled: false
}

export type GeneralSettingsPatch = Partial<Omit<AppSettings, 'geminiEnabled' | 'phraseModel'>>

export interface SettingsApi {
  load(): Promise<AppSettings>
  save(patch: GeneralSettingsPatch): Promise<void>
}

export function validSettingsPatch(
  value: unknown,
  allowGemini = false
): value is Partial<AppSettings> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(([key, setting]) => {
    switch (key) {
      case 'phraseModel':
        return allowGemini && validModelId(setting)
      case 'theme':
        return setting === 'system' || setting === 'light' || setting === 'dark'
      case 'speed':
        return typeof setting === 'number' && [0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.4, 2].includes(setting)
      case 'edgeHeight':
        return typeof setting === 'number' && [48, 64, 88].includes(setting)
      case 'weighting':
        return setting === 'uniform' || setting === 'ppm'
      case 'showGazeDot':
      case 'dwell':
        return typeof setting === 'boolean'
      case 'duration':
        return typeof setting === 'number' && [700, 1000, 1500].includes(setting)
      case 'geminiEnabled':
        return allowGemini && typeof setting === 'boolean'
      default:
        return false
    }
  })
}
