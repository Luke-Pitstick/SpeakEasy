export const EXPANSION_MODEL = 'google/gemini-3-flash-preview'
export const CANDIDATE_LIMIT = 6
export type AbbreviationToken = { id: string; kind: 'initial' | 'prefix' | 'word'; value: string }
export type TextRange = { start: number; end: number }
export type PredictionPurpose = 'expansion' | 'refinement' | 'completion'
export interface ConversationTurn {
  id: string
  speaker: 'me' | 'partner'
  text: string
}
export interface PredictionRequest {
  id: string
  revision: number
  purpose: PredictionPurpose
  lockedMessage: string
  draft: string
  tokens: AbbreviationToken[]
  target: TextRange
  conversation: ConversationTurn[]
}
export interface PhraseCandidate {
  id: string
  text: string
  replacement: string
}
export type PredictionResult = {
  requestId: string
  revision: number
  purpose: PredictionPurpose
  provider: 'gemini'
  elapsedMs: number
} & (
  | { status: 'success'; candidates: PhraseCandidate[]; complete: boolean }
  | { status: 'error'; message: string }
)
export interface GeminiStatus {
  configured: boolean
  enabled: boolean
}
export interface GeminiApi {
  status(): Promise<GeminiStatus>
  setEnabled(enabled: boolean): Promise<GeminiStatus>
  start(request: PredictionRequest): Promise<void>
  cancel(id: string): void
  onResult(listener: (result: PredictionResult) => void): () => void
}
