import type { Message, Source, TrainingKeys } from './data.mts'

export type Predictor = (history: string) => readonly number[]
export interface Observation {
  position: number
  letter: string
  probability: number
  bits: number
  top1: number
  top3: number
  top5: number
}
export interface ScoredMessage {
  id: string
  group: string
  source: Source
  unseenText: boolean
  unseenInitials: boolean
  observations: Observation[]
}
export type Subset = 'full' | 'unseenText' | 'unseenInitials'
export const SUBSETS: Subset[] = ['full', 'unseenText', 'unseenInitials']
export const eligible = (m: ScoredMessage, subset: Subset): boolean =>
  subset === 'full' || m[subset]

export function score(
  messages: Message[],
  keys: TrainingKeys,
  predict: Predictor
): ScoredMessage[] {
  return messages.map((m) => {
    const observations: Observation[] = []
    for (const segment of m.segments) {
      for (let i = 0; i < segment.length; i++) {
        const p = predict(segment.slice(0, i))
        const actual = p[segment.charCodeAt(i) - 97]
        if (!Number.isFinite(actual) || actual <= 0) throw new Error('Invalid scored probability')
        const above = p.filter((v) => v > actual + 1e-12).length
        const tied = p.filter((v) => Math.abs(v - actual) <= 1e-12).length
        const top = (k: number): number => Math.max(0, Math.min(1, (k - above) / tied))
        observations.push({
          position: observations.length + 1,
          letter: segment[i],
          probability: actual,
          bits: -Math.log2(actual),
          top1: top(1),
          top3: top(3),
          top5: top(5)
        })
      }
    }
    return {
      id: m.id,
      group: m.group,
      source: m.source,
      unseenText: !keys.text.has(m.textKey),
      unseenInitials: !keys.initials.has(m.initialKey),
      observations
    }
  })
}

export function quantile(sorted: number[], fraction: number): number | null {
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : null
}

export function metrics(observations: Observation[]): Record<string, number | null> {
  const n = observations.length
  if (!n) return { targets: 0, bits: null }
  const mean = (f: (o: Observation) => number): number =>
    observations.reduce((sum, o) => sum + f(o), 0) / n
  const probabilities = observations.map((o) => o.probability).sort((a, b) => a - b)
  return {
    targets: n,
    bits: mean((o) => o.bits),
    perplexity: 2 ** mean((o) => o.bits),
    top1: mean((o) => o.top1),
    top3: mean((o) => o.top3),
    top5: mean((o) => o.top5),
    actualProbabilityMedian: quantile(probabilities, 0.5),
    actualProbabilityP05: quantile(probabilities, 0.05),
    belowOnePercent: mean((o) => Number(o.probability < 0.01))
  }
}

export function summarize(rows: ScoredMessage[]): Record<string, unknown> {
  const report: Record<string, unknown> = {}
  const sources = [...new Set(rows.map((m) => m.source))]
  for (const source of sources)
    for (const subset of SUBSETS) {
      const selected = rows.filter((m) => m.source === source && eligible(m, subset))
      const all = selected.flatMap((m) => m.observations)
      report[`${source}/${subset}`] = {
        messages: selected.length,
        groups: new Set(selected.map((m) => m.group)).size,
        ...metrics(all),
        first24: metrics(all.filter((o) => o.position <= 24)),
        positions: Object.fromEntries(
          [
            ['1', (o: Observation) => o.position === 1],
            ['2-5', (o: Observation) => o.position >= 2 && o.position <= 5],
            ['6-10', (o: Observation) => o.position >= 6 && o.position <= 10],
            ['11+', (o: Observation) => o.position >= 11]
          ].map(([name, filter]) => [
            name,
            metrics(all.filter(filter as (o: Observation) => boolean))
          ])
        ),
        letters: Object.fromEntries(
          [...'abcdefghijklmnopqrstuvwxyz'].map((letter) => [
            letter,
            metrics(all.filter((o) => o.letter === letter))
          ])
        )
      }
    }
  return report
}

export function sourceLosses(
  rows: ScoredMessage[],
  subset: Subset = 'unseenText'
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const source of new Set(rows.map((r) => r.source))) {
    const observations = rows
      .filter((r) => r.source === source && eligible(r, subset))
      .flatMap((r) => r.observations)
    if (!observations.length) throw new Error(`No targets for ${source}/${subset}`)
    result[source] = observations.reduce((n, o) => n + o.bits, 0) / observations.length
  }
  return result
}

export function balancedLoss(rows: ScoredMessage[]): number {
  const losses = Object.values(sourceLosses(rows))
  return losses.reduce((a, b) => a + b, 0) / losses.length
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Comparison {
  improvementBits: number
  ci95: [number, number]
  bySource: Record<string, number>
  resamples: number
}
/** Positive differences favor candidate. All six Turk turns share a resampling unit. */
export function compare(
  candidate: ScoredMessage[],
  baseline: ScoredMessage[],
  subset: Subset = 'unseenText',
  resamples = 2000
): Comparison {
  if (candidate.length !== baseline.length) throw new Error('Unpaired evaluation records')
  const grouped = new Map<string, Map<string, { loss: number; n: number }>>()
  for (let i = 0; i < candidate.length; i++) {
    const a = candidate[i],
      b = baseline[i]
    if (a.id !== b.id || a.observations.length !== b.observations.length)
      throw new Error('Unpaired evaluation records')
    if (!eligible(a, subset)) continue
    const source = grouped.get(a.source) ?? new Map<string, { loss: number; n: number }>()
    const group = source.get(a.group) ?? { loss: 0, n: 0 }
    for (let j = 0; j < a.observations.length; j++) {
      group.loss += b.observations[j].bits - a.observations[j].bits
      group.n++
    }
    source.set(a.group, group)
    grouped.set(a.source, source)
  }
  const buckets = [...grouped].map(([source, groups]) => ({
    source,
    groups: [...groups.values()].filter((g) => g.n > 0)
  }))
  if (!buckets.length || buckets.some((b) => !b.groups.length))
    throw new Error('Empty bootstrap subset')
  const bySource = Object.fromEntries(
    buckets.map(({ source, groups }) => [
      source,
      groups.reduce((n, g) => n + g.loss, 0) / groups.reduce((n, g) => n + g.n, 0)
    ])
  )
  const improvementBits = Object.values(bySource).reduce((a, b) => a + b, 0) / buckets.length
  const rng = seededRandom(0x5eedaac)
  const distribution: number[] = []
  for (let r = 0; r < resamples; r++) {
    let total = 0
    for (const { groups } of buckets) {
      let loss = 0,
        n = 0
      for (let i = 0; i < groups.length; i++) {
        const sample = groups[Math.floor(rng() * groups.length)]
        loss += sample.loss
        n += sample.n
      }
      total += loss / n
    }
    distribution.push(total / buckets.length)
  }
  distribution.sort((a, b) => a - b)
  return {
    improvementBits,
    ci95: [quantile(distribution, 0.025)!, quantile(distribution, 0.975)!],
    bySource,
    resamples
  }
}
