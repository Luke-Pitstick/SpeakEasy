import { describe, expect, it } from 'vitest'
import {
  InitialsPpm,
  FrozenInitialsPpm,
  canonicalText,
  exportPpm,
  mixInitials,
  validateDistribution,
  wordInitials
} from '../src/shared/initialsPpm'
import { PpmModel } from '../src/renderer/src/features/dasher/prediction'
import { parseAac, parseTurk, parseComm2, trainingKeys } from '../scripts/initials-ppm/data.mts'
import { balancedLoss, compare, score, sourceLosses } from '../scripts/initials-ppm/evaluate.mts'

describe('initials preparation', () => {
  it('preserves contractions and breaks history at unsupported lexical tokens', () => {
    expect(
      wordInitials("I'll have coffee—don't add sugar. Café 2day sounds good; a 12 b.")
    ).toEqual({
      segments: ['ihcdas', 'sga', 'b'],
      barriers: 3
    })
    expect(wordInitials('well-known')).toEqual({ segments: ['wk'], barriers: 0 })
    expect(canonicalText('  I’m\tOK  ')).toBe("i'm ok")
    expect(wordInitials('... 123 東京')).toEqual({ segments: [], barriers: 2 })
  })

  it('keeps literal tabs and quotes, whole dialogues, and original split assignments', () => {
    const header = 'set\tid\tturn1\tturn2\tturn3\tturn4\tturn5\tturn6'
    const text = `${header}\ndev\tdialogue1\t"hello"\tHi there\tI agree\tOK\tThank you\tBye`
    const rows = parseTurk(text)
    expect(rows).toHaveLength(6)
    expect(new Set(rows.map((r) => r.group)).size).toBe(1)
    expect(rows.every((r) => r.split === 'dev')).toBe(true)
    expect(rows[0].segments).toEqual(['h'])
    expect(() => parseTurk(text + '\ntrain\tbroken')).toThrow('Invalid Turk schema')
    expect(() => parseTurk(text + '\n' + text.split('\n')[1])).toThrow('duplicate dialogue')
    expect(() => parseComm2('id\tmessage\textra')).toThrow('Invalid COMM2 schema')
  })

  it('does not treat test text as training membership or collapse distinct meanings by initials', () => {
    const train = parseAac('I want coffee\nIt was cold', 'train')
    const test = parseAac('I was careful\nA new phrase', 'test')
    const keys = trainingKeys([...train, ...test])
    expect(keys.text.size).toBe(2)
    expect(keys.initials.size).toBe(1)
    expect(keys.text.has('a new phrase')).toBe(false)
  })
})

describe('PPM estimator and immutable export', () => {
  it('accumulates independent messages without learning their boundary transitions', () => {
    const model = new InitialsPpm(4)
    model.train('ab')
    model.train('ca')
    model.train('ab')
    expect(model.counts.get('b')).toBeUndefined()
    expect(model.counts.get('a')?.[1]).toBe(2)
    expect(model.counts.get('^')?.[0]).toBe(2)
    expect(model.counts.get('')?.[0]).toBe(3)
    expect(() => model.train('a b')).toThrow()
  })

  it('matches the existing jslm-derived estimator for histories without start markers', () => {
    const previous = new PpmModel(26),
      model = new InitialsPpm(4)
    for (const sequence of ['ababcab', 'ababcb', 'bcabac', 'aaaabc']) {
      model.train(sequence)
      previous.train([...sequence].map((c) => c.charCodeAt(0) - 96))
    }
    for (const prefix of ['abab', 'aaaa', 'zzzz', 'bcab', 'xxxabcab']) {
      const expected = previous.probabilities([...prefix].map((c) => c.charCodeAt(0) - 96))
      const actual = model.probabilities(prefix)
      actual.forEach((p, i) => expect(p).toBeCloseTo(expected[i], 12))
    }
  })

  it('backs off for unfamiliar long history, keeps all letters positive, and leaves counts frozen while scoring', () => {
    const a = new InitialsPpm(4),
      b = new InitialsPpm(4)
    a.train('iwaciwac')
    b.train('helloworld')
    const before = JSON.stringify([...a.counts].map(([k, v]) => [k, [...v]]))
    const config = { maxHistory: 4, aacWeight: 0.5, floor: 0.1 }
    for (const prefix of ['', 'iw', 'zzzzzz', 'qxz']) {
      const weights = mixInitials(a.probabilities(prefix), b.probabilities(prefix), config)
      expect(() => validateDistribution(weights)).not.toThrow()
      expect(weights.every((p) => p >= 0.1 / 26)).toBe(true)
    }
    expect(JSON.stringify([...a.counts].map(([k, v]) => [k, [...v]]))).toBe(before)
  })

  it('exports identical source-mixture probabilities across seen, unseen, and beginning contexts', () => {
    const a = new InitialsPpm(4),
      b = new InitialsPpm(4)
    for (const s of ['ababc', 'bcab', 'aaaa', 'b']) a.train(s)
    for (const s of ['cabac', 'ccab', 'a']) b.train(s)
    const config = { maxHistory: 4, aacWeight: 0.5, floor: 0.05 }
    const frozen = new FrozenInitialsPpm(JSON.parse(JSON.stringify(exportPpm(a, b, config))))
    const prefixes = ['']
    for (let depth = 0; depth < 5; depth++)
      for (const p of prefixes.filter((p) => p.length === depth))
        for (const letter of 'abcx') prefixes.push(p + letter)
    for (const prefix of prefixes) {
      const expected = mixInitials(a.probabilities(prefix), b.probabilities(prefix), config)
      frozen.weights(prefix).forEach((p, i) => expect(p).toBeCloseTo(expected[i], 12))
    }
    expect(Object.isFrozen(frozen.weights('ab'))).toBe(true)
    expect(() => new FrozenInitialsPpm({})).toThrow()
    const corrupted = exportPpm(a, b, config)
    corrupted.contexts[''][0] = Number.NaN
    expect(() => new FrozenInitialsPpm(corrupted)).toThrow('Invalid initial probability')
  })
})

describe('held-out scoring and clustered comparisons', () => {
  it('scores prefixes before revealing targets, with fractional credit for tied ranks', () => {
    const rows = parseAac('I want coffee', 'dev'),
      calls: string[] = []
    const result = score(rows, trainingKeys([]), (prefix) => {
      calls.push(prefix)
      return Array(26).fill(1 / 26)
    })
    expect(calls).toEqual(['', 'i', 'iw'])
    expect(result[0].observations[0].bits).toBeCloseTo(Math.log2(26), 12)
    expect(result[0].observations[0].top3).toBeCloseTo(3 / 26, 12)
    expect(balancedLoss(result)).toBeCloseTo(Math.log2(26), 12)
  })

  it('keeps repeated text out of primary selection and bootstraps paired dialogue units reproducibly', () => {
    const rows = [
      ...parseAac('I want coffee', 'train'),
      ...parseAac('I want coffee\nAnother new phrase\nA nice day', 'dev')
    ]
    const keys = trainingKeys(rows),
      dev = rows.filter((r) => r.split === 'dev')
    const uniform = score(dev, keys, () => Array(26).fill(1 / 26))
    const improved = score(dev, keys, () => [0.5, ...Array(25).fill(0.5 / 25)])
    expect(uniform[0].unseenText).toBe(false)
    expect(compare(uniform, uniform).ci95).toEqual([0, 0])
    const result = compare(improved, uniform)
    expect(result).toEqual(compare(improved, uniform))
    expect(result.bySource.aac).toBeCloseTo(
      sourceLosses(uniform).aac - sourceLosses(improved).aac,
      12
    )
    expect(() => compare(improved, uniform.slice(1))).toThrow('Unpaired')
  })
})
