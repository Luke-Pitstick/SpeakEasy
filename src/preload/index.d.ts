import type { GeminiApi } from '../shared/prediction'
declare global {
  interface Window {
    gemini?: GeminiApi
  }
}
