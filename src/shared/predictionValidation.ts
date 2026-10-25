import {
  CANDIDATE_LIMIT,
  wordTokens,
  type PredictionRequest,
  type PhraseCandidate,
  type PredictionResult
} from './prediction'
import { conversationHistorySchema } from './conversationHistory'
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
    !bounded(value.lockedMessage, 2000) ||
    (value.conversationHistory !== undefined &&
      !conversationHistorySchema.safeParse(value.conversationHistory).success) ||
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
    (!value.tokens.some((t) => record(t) && t.kind !== 'punctuation') ||
      start !== value.draft.length ||
      end !== start)
  )
    return false
  if (value.purpose === 'completion' && (start !== value.draft.length || end !== start))
    return false
  const history = value.conversationHistory
  if (
    Array.isArray(history) &&
    value.conversation.some(
      (t) =>
        !record(t) ||
        !history.some(
          (h: unknown) => record(h) && h.id === t.id && h.speaker === t.speaker && h.text === t.text
        )
    )
  )
    return false
  return (
    value.tokens.every(
      (t) =>
        record(t) &&
        bounded(t.id, 100) &&
        ['initial', 'prefix', 'word', 'punctuation'].includes(String(t.kind)) &&
        bounded(t.value, 60) &&
        (t.kind === 'punctuation'
          ? /^[!?]$/.test(t.value)
          : /^[a-z]+(?:['-][a-z]+)*$/i.test(t.value) &&
            (t.kind !== 'initial' || t.value.length === 1))
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
  index: number,
  cacheInitials?: string
): PhraseCandidate | null {
  const trimmed = request.purpose === 'completion' ? raw.trimEnd() : raw.trim()
  // Models often wrap a single replacement word in quotes or end it with punctuation.
  const replacement =
    request.purpose === 'refinement' ? trimmed.replace(/^["“‘(]+|["”’).,!?;:]+$/gu, '') : trimmed
  if (
    !replacement.trim() ||
    replacement.length > 500 ||
    /[<>`]/.test(replacement) ||
    [...replacement].some((c) => c.charCodeAt(0) < 32) ||
    /^\s*(?:\d+[.)]|[-*#])/.test(replacement)
  )
    return null
  const tokens = wordTokens(request.tokens)
  const words = lexicalWords(replacement)
  if (!words.length) return null
  if (cacheInitials !== undefined && cacheMatch(request, replacement, cacheInitials) === null)
    return null
  if (
    cacheInitials === undefined &&
    request.purpose === 'expansion' &&
    (words.length !== tokens.length ||
      !tokens.every((token, i) =>
        token.kind === 'word'
          ? words[i] === token.value.toLowerCase()
          : words[i].startsWith(token.value.toLowerCase())
      ))
  )
    return null
  const ending = request.tokens.at(-1)
  if (
    request.purpose === 'expansion' &&
    ending?.kind === 'punctuation' &&
    !replacement.endsWith(ending.value)
  )
    return null
  if (
    request.purpose === 'refinement' &&
    (!/^[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*$/u.test(replacement) ||
      !replacement.toLowerCase().startsWith(request.draft[request.target.start].toLowerCase()) ||
      replacement.toLowerCase() ===
        request.draft.slice(request.target.start, request.target.end).toLowerCase())
  )
    return null
  const prefix = request.draft.slice(0, request.target.start)
  const separator = prefix && !/\s$/.test(prefix) && request.purpose === 'expansion' ? ' ' : ''
  const text = prefix + separator + replacement + request.draft.slice(request.target.end)
  if (text.length > 500) return null
  return {
    id: `${request.id}:${index}`,
    text,
    replacement,
    ...(cacheInitials !== undefined ? { cacheInitials } : {})
  }
}

/** Cached wording must match every initial and preserve explicit word or prefix constraints. */
export function cacheMatch(request: PredictionRequest, text: string, saved: string): number | null {
  if (request.purpose !== 'expansion' || !/^[a-z]{1,24}$/.test(saved)) return null
  const tokens = wordTokens(request.tokens)
  const query = tokens.map((t) => t.value[0].toLowerCase()).join('')
  const words = lexicalWords(text)
  if (
    tokens.some(
      (t, i) =>
        t.kind !== 'initial' &&
        (words.length !== tokens.length ||
          (t.kind === 'word'
            ? words[i] !== t.value.toLowerCase()
            : !words[i]?.startsWith(t.value.toLowerCase())))
    )
  )
    return null
  return query === words.map((word) => word[0]).join('') ? 0 : null
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
    if (item.cacheInitials !== undefined && typeof item.cacheInitials !== 'string')
      return fail('Invalid cached suggestion.')
    const candidate = candidateFor(
        request,
        item.replacement,
        candidates.length,
        item.cacheInitials as string | undefined
      ),
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
    ...(bounded(result.message, 300) ? { message: result.message } : {}),
    elapsedMs:
      typeof result.elapsedMs === 'number' && Number.isFinite(result.elapsedMs)
        ? Math.max(0, result.elapsedMs)
        : 0
  }
}
