import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'
import { validateResult } from '../src/shared/predictionValidation'
export { validateResult }
type TestScenario = 'normal' | 'error' | 'timeout' | 'empty' | 'invalid' | 'late'
// Project-authored fixtures. These are not research-model outputs or a language model.
export const phrases = [
  'I want a coffee',
  'I want a cookie',
  'I would appreciate company',
  'I want another cushion',
  'I need some water',
  'I need some warmth',
  'I need some writing',
  'I need some wipes',
  'Can you help me',
  'Could you hear me',
  'Can you hold me',
  'Could you help move',
  'Thank you so much',
  'That yogurt smells marvelous',
  'Take your shoes mate',
  'Tell your sister morning'
]

function matches(phrase: string, request: PredictionRequest): boolean {
  const words = phrase.toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) ?? []
  return (
    words.length === request.tokens.length &&
    request.tokens.every((token, index) =>
      token.kind === 'word'
        ? words[index] === token.value.toLowerCase()
        : words[index]?.startsWith(token.value.toLowerCase())
    )
  )
}

function replacements(request: PredictionRequest): string[] {
  if (request.purpose === 'expansion') return phrases.filter((phrase) => matches(phrase, request))
  if (request.purpose === 'completion') {
    const prefix = request.draft.slice(0, request.target.start)
    return phrases
      .filter(
        (phrase) =>
          phrase.toLowerCase().startsWith(prefix.toLowerCase()) && phrase.length > prefix.length
      )
      .map((phrase) => phrase.slice(prefix.length))
  }
  const selected = request.draft.slice(request.target.start, request.target.end).toLowerCase()
  const groups = [
    ['coffee', 'cocoa', 'cider', 'cream'],
    ['cookie', 'cake', 'croissant', 'cereal'],
    ['want', 'wish', 'welcome'],
    ['help', 'hear', 'hold', 'hug'],
    ['warmth', 'water', 'writing', 'wipes'],
    ['great', 'good', 'glad', 'grateful']
  ]
  return groups.find((group) => group.includes(selected)) ?? []
}

export class TestPhrasePredictor {
  constructor(
    private scenario: TestScenario = 'normal',
    private delay = 450
  ) {}

  predict(request: PredictionRequest, signal: AbortSignal): Promise<PredictionResult> {
    const started = performance.now()
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'))
        return
      }
      const onAbort = (): void => {
        clearTimeout(timer)
        reject(new DOMException('Cancelled', 'AbortError'))
      }
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', onAbort)
          const base = {
            requestId: request.id,
            revision: request.revision,
            purpose: request.purpose,
            provider: 'gemini' as const,
            elapsedMs: performance.now() - started
          }
          if (this.scenario === 'error' || this.scenario === 'timeout') {
            resolve({
              ...base,
              status: 'error',
              message:
                this.scenario === 'timeout'
                  ? 'Demo request timed out. Retry or continue spelling.'
                  : 'Simulated provider error. Your draft is safe; retry or continue spelling.'
            })
            return
          }
          const options =
            this.scenario === 'empty'
              ? []
              : this.scenario === 'invalid'
                ? ['This ignores your constraints\n']
                : replacements(request)
          resolve(
            validateResult(request, {
              ...base,
              status: 'success',
              complete: true,
              candidates: options.map((replacement) => ({ replacement }))
            })
          )
        },
        this.scenario === 'late' || this.scenario === 'timeout' ? 2000 : this.delay
      )
      // Deliberately ignore cancellation in the late-response test condition.
      if (this.scenario !== 'late') signal.addEventListener('abort', onAbort, { once: true })
    })
  }
}

export function installGeminiMock(): void {
  const listeners = new Set<(result: PredictionResult) => void>()
  const controllers = new Map<string, AbortController>()
  window.gemini = {
    summarize: async () => 'Earlier conversation.',
    cancelSummary: () => {},
    clearPhraseCache: async () => {},
    status: async () => ({ configured: true, enabled: false }),
    setEnabled: async (enabled) => ({ configured: true, enabled }),
    start: async (request) => {
      const controller = new AbortController()
      controllers.set(request.id, controller)
      void new TestPhrasePredictor()
        .predict(request, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) listeners.forEach((listener) => listener(result))
        })
        .catch(() => {})
        .finally(() => controllers.delete(request.id))
    },
    cancel: (id) => controllers.get(id)?.abort(),
    onResult: (callback) => {
      listeners.add(callback)
      return () => {
        listeners.delete(callback)
      }
    }
  }
}
