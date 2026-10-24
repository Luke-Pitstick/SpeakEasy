export type AbbreviationToken = { id: string; kind: 'initial' | 'word'; value: string }
export type TextRange = { start: number; end: number }
export type PredictionPurpose = 'expansion' | 'refinement' | 'completion'
export type DemoScenario = 'normal' | 'empty' | 'error' | 'timeout' | 'late' | 'invalid'

export interface PredictionRequest {
  id: string
  revision: number
  purpose: PredictionPurpose
  draft: string
  tokens: AbbreviationToken[]
  target: TextRange
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
  provider: 'demo'
  elapsedMs: number
} & ({ status: 'success'; candidates: PhraseCandidate[] } | { status: 'error'; message: string })

/** A real adapter implements this port; AbortSignal stays local, never crosses IPC. */
export interface PhrasePredictor {
  predict(request: PredictionRequest, signal: AbortSignal): Promise<PredictionResult>
}
