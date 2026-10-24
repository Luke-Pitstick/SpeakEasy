import type {
  DemoScenario,
  PhrasePredictor,
  PredictionRequest,
  PredictionResult
} from '../../../shared/prediction'

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
    ['coffee', 'tea', 'water', 'juice'],
    ['cookie', 'sandwich', 'snack', 'apple'],
    ['want', 'need', 'prefer', 'like'],
    ['help', 'hear', 'hold', 'join'],
    ['warmth', 'blanket', 'cushion', 'company']
  ]
  return groups.find((group) => group.includes(selected)) ?? []
}

/** Validate at the provider boundary, and construct full text from the captured destination. */
export function validateResult(request: PredictionRequest, result: unknown): PredictionResult {
  const base = {
    requestId: request.id,
    revision: request.revision,
    purpose: request.purpose,
    provider: 'demo' as const,
    elapsedMs: 0
  }
  const fail = (message: string): PredictionResult => ({ ...base, status: 'error', message })
  if (!result || typeof result !== 'object')
    return fail('Invalid suggestion response. Your text is unchanged.')
  const value = result as Record<string, unknown>
  if (
    value.requestId !== request.id ||
    value.revision !== request.revision ||
    value.purpose !== request.purpose ||
    value.provider !== 'demo'
  )
    return fail('The suggestion response did not match this request.')
  if (value.status === 'error')
    return fail(
      typeof value.message === 'string'
        ? value.message.slice(0, 200)
        : 'Suggestions unavailable. Try again or keep spelling.'
    )
  if (value.status !== 'success' || !Array.isArray(value.candidates))
    return fail('Invalid suggestion response. Try again or keep spelling.')
  if (
    request.target.start < 0 ||
    request.target.end < request.target.start ||
    request.target.end > request.draft.length
  )
    return fail('The editing range is no longer valid.')
  const seen = new Set<string>()
  const candidates: Extract<PredictionResult, { status: 'success' }>['candidates'] = []
  for (const item of value.candidates.slice(0, 12)) {
    if (!item || typeof item !== 'object' || typeof item.replacement !== 'string') continue
    const replacement: string = item.replacement
    if (
      !replacement.trim() ||
      replacement.length > 100 ||
      [...replacement].some((character) => character.charCodeAt(0) < 32) ||
      seen.has(replacement.toLowerCase())
    )
      continue
    if (request.purpose === 'expansion' && !matches(replacement, request)) continue
    if (request.purpose === 'refinement' && !/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(replacement))
      continue
    seen.add(replacement.toLowerCase())
    const prefix = request.draft.slice(0, request.target.start)
    const separator = request.purpose === 'expansion' && prefix && !/\s$/.test(prefix) ? ' ' : ''
    const text = prefix + separator + replacement + request.draft.slice(request.target.end)
    if (text.length > 500) continue
    candidates.push({ id: `${request.id}:${candidates.length}`, replacement, text })
    if (candidates.length === 4) break
  }
  if (value.candidates.length && !candidates.length)
    return fail('Suggestions did not preserve your constraints. Keep spelling or try again.')
  return {
    ...base,
    elapsedMs:
      typeof value.elapsedMs === 'number' && Number.isFinite(value.elapsedMs) ? value.elapsedMs : 0,
    status: 'success',
    candidates
  }
}

export class DemoPhrasePredictor implements PhrasePredictor {
  constructor(
    private scenario: DemoScenario = 'normal',
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
            provider: 'demo' as const,
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
