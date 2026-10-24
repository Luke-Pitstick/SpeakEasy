// PPM interpolation rule derived from the Apache-2.0 jslm adaptation in
// renderer/src/features/dasher/prediction.ts. See THIRD_PARTY_NOTICES.md.
// Modified: independent turns, context-only start marker, arbitrary history cap,
// source interpolation, immutable export. No online adaptation or UI coupling.
export const INITIALS = 'abcdefghijklmnopqrstuvwxyz'
export const PPM_ALPHA = 0.49
export const PPM_BETA = 0.77
export const TOKENIZER_VERSION = 'english-initials-v1'

export interface InitialSegments {
  segments: string[]
  barriers: number
}

/** Unsupported lexical tokens break context; punctuation alone does not. */
export function wordInitials(text: string): InitialSegments {
  const tokens =
    text
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu) ?? []
  const segments: string[] = []
  let run = ''
  let barriers = 0
  for (const token of tokens) {
    if (/^[a-z]+(?:'[a-z]+)*$/.test(token)) run += token[0]
    else {
      if (run) segments.push(run)
      run = ''
      barriers++
    }
  }
  if (run) segments.push(run)
  return { segments, barriers }
}

export function canonicalText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").trim().replace(/\s+/g, ' ')
}

export function validateDistribution(p: readonly number[]): void {
  if (
    p.length !== 26 ||
    p.some((v) => !Number.isFinite(v) || v < 0) ||
    Math.abs(p.reduce((a, b) => a + b, 0) - 1) > 1e-9
  )
    throw new Error('Invalid initial probability distribution')
}

/** Count tables implement the existing estimator without mutable trie pointers. */
export class InitialsPpm {
  readonly counts = new Map<string, Float64Array>()
  readonly maxHistory: number

  constructor(maxHistory: number) {
    if (!Number.isInteger(maxHistory) || maxHistory < 0 || maxHistory > 10)
      throw new Error('PPM history must be an integer from 0 to 10')
    this.maxHistory = maxHistory
  }

  train(sequence: string): void {
    if (!/^[a-z]*$/.test(sequence)) throw new Error('Training sequence must contain only initials')
    let history = '^'
    for (const letter of sequence) {
      for (let length = 0; length <= Math.min(history.length, this.maxHistory); length++) {
        const context = length ? history.slice(-length) : ''
        let counts = this.counts.get(context)
        if (!counts) this.counts.set(context, (counts = new Float64Array(26)))
        counts[letter.charCodeAt(0) - 97]++
      }
      history = (history + letter).slice(-this.maxHistory || undefined)
    }
  }

  probabilities(prefix: string): number[] {
    if (!/^[a-z]*$/.test(prefix)) throw new Error('Prediction prefix must contain only initials')
    return this.distribution(('^' + prefix).slice(-this.maxHistory || undefined))
  }

  distribution(history: string): number[] {
    const result = Array<number>(26).fill(0)
    let remaining = 1
    for (let length = Math.min(history.length, this.maxHistory); length >= 0; length--) {
      const counts = this.counts.get(length ? history.slice(-length) : '')
      if (!counts) continue
      const total = counts.reduce((a, b) => a + b, 0)
      const mass = remaining
      for (let i = 0; i < 26; i++)
        if (counts[i]) {
          const probability = (mass * (counts[i] - PPM_BETA)) / (total + PPM_ALPHA)
          result[i] += probability
          remaining -= probability
        }
    }
    return result.map((p) => p + remaining / 26)
  }

  unigram(): number[] {
    const counts = this.counts.get('')
    const total = counts?.reduce((a, b) => a + b, 0) ?? 0
    return total && counts ? Array.from(counts, (n) => n / total) : Array(26).fill(1 / 26)
  }
}

export interface PpmConfig {
  maxHistory: number
  aacWeight: number
  floor: number
}

export function mixInitials(
  a: readonly number[],
  b: readonly number[],
  config: PpmConfig
): number[] {
  const { aacWeight, floor } = config
  if (aacWeight < 0 || aacWeight > 1 || floor <= 0 || floor >= 1)
    throw new Error('Invalid source weight or probability floor')
  validateDistribution(a)
  validateDistribution(b)
  return a.map((p, i) => (1 - floor) * (aacWeight * p + (1 - aacWeight) * b[i]) + floor / 26)
}

export interface PpmArtifact {
  format: 'speakeasy-initials-ppm-v1'
  alphabet: string
  tokenizer: string
  estimator: { alpha: number; beta: number; exclusion: false; start: '^' }
  config: PpmConfig
  contexts: Record<string, number[]>
}

export function exportPpm(a: InitialsPpm, b: InitialsPpm, config: PpmConfig): PpmArtifact {
  const keys = new Set(['', ...a.counts.keys(), ...b.counts.keys()])
  const contexts: Record<string, number[]> = Object.create(null)
  for (const key of [...keys].sort()) {
    contexts[key] = mixInitials(a.distribution(key), b.distribution(key), config)
  }
  return {
    format: 'speakeasy-initials-ppm-v1',
    alphabet: INITIALS,
    tokenizer: TOKENIZER_VERSION,
    estimator: { alpha: PPM_ALPHA, beta: PPM_BETA, exclusion: false, start: '^' },
    config,
    contexts
  }
}

/** Loading validates once; lookup never modifies a model or applies another floor. */
export class FrozenInitialsPpm {
  readonly artifact: PpmArtifact
  constructor(value: unknown) {
    const artifact = value as PpmArtifact
    if (
      artifact?.format !== 'speakeasy-initials-ppm-v1' ||
      artifact.alphabet !== INITIALS ||
      artifact.tokenizer !== TOKENIZER_VERSION ||
      artifact.estimator?.alpha !== PPM_ALPHA ||
      artifact.estimator?.beta !== PPM_BETA ||
      artifact.estimator?.exclusion !== false ||
      artifact.estimator?.start !== '^' ||
      !artifact.contexts ||
      !artifact.contexts['']
    )
      throw new Error('Unsupported or incomplete PPM artifact')
    const { maxHistory, aacWeight, floor } = artifact.config ?? {}
    if (
      !Number.isInteger(maxHistory) ||
      maxHistory < 0 ||
      maxHistory > 10 ||
      !Number.isFinite(aacWeight) ||
      aacWeight < 0 ||
      aacWeight > 1 ||
      !Number.isFinite(floor) ||
      floor <= 0 ||
      floor >= 1
    )
      throw new Error('Invalid PPM artifact configuration')
    for (const [context, p] of Object.entries(artifact.contexts)) {
      if (!/^\^?[a-z]*$/.test(context) || context.length > maxHistory)
        throw new Error('Invalid PPM artifact context')
      validateDistribution(p)
      if (p.some((v) => v < floor / 26 - 1e-12)) throw new Error('PPM floor violated')
      Object.freeze(p)
    }
    Object.freeze(artifact.config)
    Object.freeze(artifact.contexts)
    this.artifact = Object.freeze(artifact)
  }

  weights(prefix: string): readonly number[] {
    if (!/^[a-z]*$/.test(prefix)) throw new Error('Prediction prefix must contain only initials')
    const history = ('^' + prefix).slice(-this.artifact.config.maxHistory || undefined)
    for (
      let length = Math.min(history.length, this.artifact.config.maxHistory);
      length >= 0;
      length--
    ) {
      const vector = this.artifact.contexts[length ? history.slice(-length) : '']
      if (vector) return vector
    }
    throw new Error('Missing root distribution')
  }
}
