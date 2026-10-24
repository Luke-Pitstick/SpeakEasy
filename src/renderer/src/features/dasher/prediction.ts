// Derived from Google Research's jslm PPM implementation (Apache-2.0).
// See THIRD_PARTY_NOTICES.md. Modified: typed bounded contexts, fixed fixture,
// precomputed distributions, no logging, no adaptive or corpus-loading APIs.
import { trainedInitials } from './initials-model'

const ALPHA = 0.49
const BETA = 0.77
const ORDER = 4

class PpmNode {
  children = new Map<number, PpmNode>()
  backoff: PpmNode | null = null
  count = 1
  constructor(readonly symbol = 0) {}
}

interface Context {
  head: PpmNode
  order: number
}

export class PpmModel {
  root = new PpmNode()
  constructor(readonly size: number) {}

  private add(node: PpmNode, symbol: number): PpmNode {
    let child = node.children.get(symbol)
    if (child) {
      child.count++
      let backoff = child.backoff
      while (backoff) {
        backoff.count++
        backoff = backoff.backoff
      }
    } else {
      child = new PpmNode(symbol)
      node.children.set(symbol, child)
      child.backoff = node === this.root ? this.root : this.add(node.backoff!, symbol)
    }
    return child
  }

  train(symbols: number[]): void {
    const context: Context = { head: this.root, order: 0 }
    for (const symbol of symbols) {
      context.head = this.add(context.head, symbol)
      context.order++
      while (context.order > ORDER) {
        context.head = context.head.backoff!
        context.order--
      }
    }
  }

  probabilities(symbols: number[]): number[] {
    let head: PpmNode | null = this.root
    let order = 0
    for (const symbol of symbols) {
      while (head) {
        const child: PpmNode | undefined = order < ORDER ? head.children.get(symbol) : undefined
        if (child) {
          head = child
          order++
          break
        }
        head = head.backoff
        order--
      }
      if (!head) {
        head = this.root
        order = 0
      }
    }
    const probabilities = Array<number>(this.size).fill(0)
    let remaining = 1
    while (head) {
      const count = [...head.children.values()].reduce((sum, node) => sum + node.count, 0)
      const mass = remaining
      for (const child of head.children.values()) {
        const probability = (mass * (child.count - BETA)) / (count + ALPHA)
        probabilities[child.symbol - 1] += probability
        remaining -= probability
      }
      head = head.backoff
    }
    return probabilities.map((probability) => probability + remaining / this.size)
  }
}

// Authored for this demo. No external books, personal history, or model weights.
const TRAINING =
  'I want a coffee. I want a cookie. I need some water. Can you help me? Thank you so much. I would like a sandwich. Please bring my blanket. My name is Alex. I prefer tea. Let us go outside. Good morning. See you soon! I feel comfortable. The quick brown fox jumps over the lazy dog. 0123456789'

export const LITERAL_ALPHABET = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?\'"-:;/@()&+\n'
]
export const INITIAL_ALPHABET = [...'abcdefghijklmnopqrstuvwxyz']

export function normalize(weights: number[], size: number): number[] {
  if (weights.length !== size || weights.some((weight) => !Number.isFinite(weight) || weight < 0))
    return Array<number>(size).fill(1 / size)
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum <= 0) return Array<number>(size).fill(1 / size)
  return weights.map((weight) => (0.95 * weight) / sum + 0.05 / size)
}

/** Initials use a frozen trained asset; literal PPM is prepared before steering. */
export class CharacterPredictor {
  private cache = new Map<string, number[]>()
  private uniform: number[]
  constructor(
    readonly alphabet: string[],
    readonly mode: 'uniform' | 'ppm' | 'initials'
  ) {
    this.uniform = alphabet.map(() => 1 / alphabet.length)
    if (mode === 'uniform') return
    if (mode === 'initials') return
    const ids = new Map(alphabet.map((symbol, index) => [symbol, index + 1]))
    const corpus = [...TRAINING].filter((symbol) => ids.has(symbol))
    const model = new PpmModel(alphabet.length)
    model.train(corpus.map((symbol) => ids.get(symbol)!))
    const contexts = new Set(['', ...alphabet])
    for (let end = 1; end <= corpus.length; end++) {
      for (let length = 1; length <= ORDER && length <= end; length++)
        contexts.add(corpus.slice(end - length, end).join(''))
    }
    for (const context of contexts)
      this.cache.set(
        context,
        normalize(
          model.probabilities([...context].map((symbol) => ids.get(symbol)!)),
          alphabet.length
        )
      )
  }

  weights(text: string): readonly number[] {
    if (this.mode === 'uniform') return this.uniform
    // Return the evaluated distribution unchanged: normalize() would add a
    // second smoothing pass. Neither training nor model replacement runs here.
    if (this.mode === 'initials') return trainedInitials.model?.weights(text) ?? this.uniform
    const tail = [...text].slice(-ORDER)
    while (tail.length && !this.cache.has(tail.join(''))) tail.shift()
    return this.cache.get(tail.join('')) ?? this.uniform
  }
}
