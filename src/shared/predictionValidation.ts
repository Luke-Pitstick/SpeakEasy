import {
  CANDIDATE_LIMIT,
  type PredictionRequest,
  type PhraseCandidate,
  type PredictionResult
} from './prediction'
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const bounded = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length <= max &&
  ![...value].some((c) => c.charCodeAt(0) < 32 && !'\t\n\r'.includes(c))
export function validRequest(value: unknown): value is PredictionRequest {
  if (
    !record(value) ||
    !bounded(value.id, 100) ||
    !value.id ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !['expansion', 'refinement', 'completion'].includes(String(value.purpose)) ||
    !bounded(value.draft, 500) ||
    !Array.isArray(value.tokens) ||
    value.tokens.length > 24 ||
    !record(value.target) ||
    !Array.isArray(value.conversation) ||
    value.conversation.length > 8
  )
    return false
  const { start, end } = value.target
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    Number(start) < 0 ||
    Number(end) < Number(start) ||
    Number(end) > value.draft.length
  )
    return false
  if (
    value.purpose === 'refinement' &&
    (start === end ||
      !/^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(
        value.draft.slice(Number(start), Number(end))
      ))
  )
    return false
  if (
    value.purpose === 'expansion' &&
    (!value.tokens.length || start !== value.draft.length || end !== start)
  )
    return false
  if (value.purpose === 'completion' && (start !== value.draft.length || end !== start))
    return false
  return (
    value.tokens.every(
      (t) =>
        record(t) &&
        bounded(t.id, 100) &&
        ['initial', 'prefix', 'word'].includes(String(t.kind)) &&
        bounded(t.value, 60) &&
        /^[a-z]+(?:['-][a-z]+)*$/i.test(t.value) &&
        (t.kind !== 'initial' || t.value.length === 1)
    ) &&
    new Set(value.tokens.map((t) => t.id)).size === value.tokens.length &&
    value.conversation.every(
      (t) =>
        record(t) &&
        bounded(t.id, 100) &&
        ['me', 'partner'].includes(String(t.speaker)) &&
        bounded(t.text, 1000) &&
        !!t.text.trim()
    )
  )
}
export function lexicalWords(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? []
  )
}
export function candidateFor(
  request: PredictionRequest,
  raw: string,
  index: number
): PhraseCandidate | null {
  const replacement = request.purpose === 'completion' ? raw.trimEnd() : raw.trim()
  if (
    !replacement.trim() ||
    replacement.length > 500 ||
    /[<>`]/.test(replacement) ||
    [...replacement].some((c) => c.charCodeAt(0) < 32) ||
    /^\s*(?:\d+[.)]|[-*#])/.test(replacement)
  )
    return null
  const words = lexicalWords(replacement)
  if (!words.length) return null
  if (
    request.purpose === 'expansion' &&
    (words.length !== request.tokens.length ||
      !request.tokens.every((token, i) =>
        token.kind === 'word'
          ? words[i] === token.value.toLowerCase()
          : words[i].startsWith(token.value.toLowerCase())
      ))
  )
    return null
  if (
    request.purpose === 'refinement' &&
    (!/^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(replacement) ||
      !replacement.toLowerCase().startsWith(request.draft[request.target.start].toLowerCase()))
  )
    return null
  const prefix = request.draft.slice(0, request.target.start)
  const separator = prefix && !/\s$/.test(prefix) && request.purpose === 'expansion' ? ' ' : ''
  const text = prefix + separator + replacement + request.draft.slice(request.target.end)
  if (text.length > 500) return null
  return { id: `${request.id}:${index}`, text, replacement }
}
export function validateResult(request: PredictionRequest, result: unknown): PredictionResult {
  const base = {
    requestId: request.id,
    revision: request.revision,
    purpose: request.purpose,
    provider: 'gemini' as const,
    elapsedMs: 0
  }
  const fail = (message: string): PredictionResult => ({ ...base, status: 'error', message })
  if (
    !record(result) ||
    result.requestId !== request.id ||
    result.revision !== request.revision ||
    result.purpose !== request.purpose ||
    result.provider !== 'gemini'
  )
    return fail('The suggestion response did not match this request.')
  if (result.status === 'error')
    return fail(
      bounded(result.message, 300)
        ? result.message
        : 'Suggestions unavailable. Retry or keep spelling.'
    )
  if (
    result.status !== 'success' ||
    !Array.isArray(result.candidates) ||
    result.candidates.length > CANDIDATE_LIMIT ||
    typeof result.complete !== 'boolean'
  )
    return fail('Invalid suggestion response.')
  const candidates: PhraseCandidate[] = [],
    seen = new Set<string>()
  for (const item of result.candidates) {
    if (!record(item) || typeof item.replacement !== 'string')
      return fail('Invalid suggestion response.')
    const candidate = candidateFor(request, item.replacement, candidates.length),
      key = lexicalWords(item.replacement).join(' ')
    if (!candidate || seen.has(key))
      return fail('Suggestions did not preserve your constraints. Keep spelling or try again.')
    candidates.push(candidate)
    seen.add(key)
  }
  return {
    ...base,
    status: 'success',
    candidates,
    complete: result.complete,
    elapsedMs:
      typeof result.elapsedMs === 'number' && Number.isFinite(result.elapsedMs)
        ? Math.max(0, result.elapsedMs)
        : 0
  }
}
