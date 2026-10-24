import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { arch, cpus, platform } from 'node:os'
import { performance } from 'node:perf_hooks'
import {
  InitialsPpm,
  FrozenInitialsPpm,
  exportPpm,
  mixInitials,
  PPM_ALPHA,
  PPM_BETA,
  TOKENIZER_VERSION
} from '../../src/shared/initialsPpm.ts'
import type { PpmConfig } from '../../src/shared/initialsPpm.ts'
import {
  acquire,
  cacheDirectory,
  dataSummary,
  hash,
  loadMessages,
  outputDirectory,
  readJson,
  trainingKeys,
  writeJson
} from './data.mts'
import type { Acquisition, Message } from './data.mts'
import { balancedLoss, compare, score, sourceLosses, summarize, quantile } from './evaluate.mts'
import type { Comparison, Predictor, ScoredMessage } from './evaluate.mts'

const protocol = {
  version: 'initials-ppm-offline-v1',
  tokenizer: TOKENIZER_VERSION,
  estimator: { alpha: PPM_ALPHA, beta: PPM_BETA, exclusion: false },
  histories: [2, 4, 6, 8, 10],
  aacWeights: [0, 0.5, 1],
  floors: [0.05, 0.1, 0.2],
  selection:
    'equal-source unseen-text bits; within 0.01 of minimum prefer short history, single source, larger floor, AAC',
  novelty: 'union of AAC and Turk training text keys, identical records for every candidate',
  bootstrap: {
    seed: 0x5eedaac,
    resamples: 2000,
    units: 'AAC messages, whole Turk dialogues; COMM2 messages (scenario metadata unavailable)'
  },
  devGate: { improvementBits: 0.1, lowerCiAbove: 0, maxSourceRegressionBits: 0.05 },
  finalGate:
    'COMM2 unseen text beats uniform and unigram with CI>0; original sources regress <=0.05 bits',
  noAdaptation: true,
  noDevRefit: true,
  scope:
    'offline model only; synthetic engine, Electron, and gaze gates deferred until separately authorized integration',
  sources:
    'original Turk TSV; repeats retained; current pages say CC BY 4.0, old Turk/COMM2 READMEs say BY-ND; redistribution unresolved'
}
const codeFiles = [
  'src/shared/initialsPpm.ts',
  'scripts/initials-ppm/data.mts',
  'scripts/initials-ppm/evaluate.mts',
  'scripts/initials-ppm/cli.mts'
]
const codeHashes = (): Record<string, string> =>
  Object.fromEntries(codeFiles.map((p) => [p, hash(readFileSync(p))]))

function models(training: Message[], history: number): [InitialsPpm, InitialsPpm] {
  const aac = new InitialsPpm(history),
    turk = new InitialsPpm(history)
  for (const m of training)
    for (const segment of m.segments) (m.source === 'aac' ? aac : turk).train(segment)
  return [aac, turk]
}

function predictor(
  pair: [InitialsPpm, InitialsPpm],
  config: PpmConfig,
  unigram = false
): Predictor {
  if (unigram) {
    const p = mixInitials(pair[0].unigram(), pair[1].unigram(), config)
    return () => p
  }
  const cache = new Map<string, number[]>()
  return (prefix) => {
    const key = ('^' + prefix).slice(-config.maxHistory)
    let p = cache.get(key)
    if (!p) {
      p = mixInitials(pair[0].distribution(key), pair[1].distribution(key), config)
      cache.set(key, p)
    }
    return p
  }
}

interface Candidate {
  config: PpmConfig
  loss: number
  bySource: Record<string, number>
}
interface Freeze {
  run: string
  modelHash: string
  baselineHash: string
  protocolHash: string
  codeHashes: Record<string, string>
  sourceHashes: Record<string, string>
  config: PpmConfig
  unigramConfig: PpmConfig
  devPass: boolean
  createdAt: string
}

function tieOrder(a: Candidate, b: Candidate): number {
  const single = (weight: number): number => (weight === 0.5 ? 1 : 0)
  return (
    a.config.maxHistory - b.config.maxHistory ||
    single(a.config.aacWeight) - single(b.config.aacWeight) ||
    b.config.floor - a.config.floor ||
    b.config.aacWeight - a.config.aacWeight
  )
}
function choose(candidates: Candidate[]): Candidate {
  const minimum = Math.min(...candidates.map((c) => c.loss))
  return candidates.filter((c) => c.loss <= minimum + 0.01).sort(tieOrder)[0]
}

function benchmark(serialized: string, records: Message[]): unknown {
  global.gc?.()
  const heapBefore = process.memoryUsage().heapUsed
  const parseStart = performance.now()
  const loaded = new FrozenInitialsPpm(JSON.parse(serialized))
  const parseMs = performance.now() - parseStart
  global.gc?.()
  const heapIncrease = Math.max(0, process.memoryUsage().heapUsed - heapBefore)
  const prefixes = records
    .flatMap((m) => m.segments.flatMap((s) => [...s].map((_, i) => s.slice(0, i))))
    .slice(0, 10000)
  const coldStart = performance.now()
  loaded.weights(prefixes[0] ?? '')
  const coldLookupMs = performance.now() - coldStart
  for (const prefix of prefixes) loaded.weights(prefix)
  const samples: number[] = []
  for (let pass = 0; pass < 5; pass++)
    for (const prefix of prefixes) {
      const start = performance.now()
      loaded.weights(prefix)
      samples.push(performance.now() - start)
    }
  samples.sort((a, b) => a - b)
  return {
    bytes: Buffer.byteLength(serialized),
    contexts: Object.keys(loaded.artifact.contexts).length,
    parseAndValidateMs: parseMs,
    heapIncreaseBytes: heapIncrease,
    gcAvailable: !!global.gc,
    coldLookupMs,
    warmLookupP50Ms: quantile(samples, 0.5),
    warmLookupP95Ms: quantile(samples, 0.95),
    warmLookupP99Ms: quantile(samples, 0.99),
    lookupSamples: samples.length,
    node: process.version,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    note: 'Node offline lookup benchmark; no renderer, sample-to-feedback, or gaze measurement'
  }
}

function train(): void {
  const acquisition = acquire('prepare')
  const messages = loadMessages(),
    keys = trainingKeys(messages)
  const training = messages.filter((m) => m.split === 'train')
  const dev = messages.filter((m) => m.split === 'dev')
  const hashes = codeHashes()
  const sourceHashes = Object.fromEntries(
    acquisition
      .filter((s) => ['aac-train', 'aac-dev', 'turk'].includes(s.id))
      .map((s) => [s.id, s.sha256])
  )
  const protocolHash = hash(JSON.stringify(protocol))
  const run = hash(JSON.stringify({ hashes, sourceHashes, protocolHash })).slice(0, 16)
  const directory = join(outputDirectory, run)
  mkdirSync(directory, { recursive: true })
  writeJson(join(outputDirectory, 'latest.json'), { run })
  if (existsSync(join(directory, 'freeze.json'))) {
    console.log(`Existing frozen run: ${directory}`)
    return
  }
  writeJson(join(directory, 'protocol.json'), protocol)
  writeJson(join(directory, 'acquisition.json'), acquisition)
  writeJson(
    join(directory, 'data-summary.json'),
    dataSummary(
      messages.filter((m) => m.split !== 'test'),
      keys
    )
  )
  const started = performance.now()
  const candidates: Candidate[] = [],
    unigrams: Candidate[] = []
  for (const history of protocol.histories) {
    const pair = models(training, history)
    for (const aacWeight of protocol.aacWeights)
      for (const floor of protocol.floors) {
        const config = { maxHistory: history, aacWeight, floor }
        const rows = score(dev, keys, predictor(pair, config))
        candidates.push({ config, loss: balancedLoss(rows), bySource: sourceLosses(rows) })
        if (history === protocol.histories[0]) {
          const unigramConfig = { ...config, maxHistory: 0 }
          const base = score(dev, keys, predictor(pair, unigramConfig, true))
          unigrams.push({
            config: unigramConfig,
            loss: balancedLoss(base),
            bySource: sourceLosses(base)
          })
        }
      }
    console.log(`Validated history ${history}: ${candidates.length}/45 PPM candidates`)
  }
  const winner = choose(candidates),
    unigram = choose(unigrams)
  const pair = models(training, winner.config.maxHistory)
  const artifact = exportPpm(...pair, winner.config)
  const serialized = JSON.stringify(artifact) + '\n'
  const frozen = new FrozenInitialsPpm(JSON.parse(serialized))
  const baseline = predictor(pair, unigram.config, true)('')
  const baselineSerialized =
    JSON.stringify({ config: unigram.config, probabilities: baseline }) + '\n'
  const online = predictor(pair, winner.config)
  let maxParityError = 0
  const observations = dev.flatMap((m) =>
    m.segments.flatMap((s) => [...s].map((_, i) => s.slice(0, i)))
  )
  for (const prefix of [...observations, 'zzzzzzzzzz', 'qxz', 'a'.repeat(24)]) {
    const expected = online(prefix),
      actual = frozen.weights(prefix)
    for (let i = 0; i < 26; i++)
      maxParityError = Math.max(maxParityError, Math.abs(expected[i] - actual[i]))
  }
  if (maxParityError > 1e-12) throw new Error(`Exported model parity failed: ${maxParityError}`)
  const ppmRows = score(dev, keys, (p) => frozen.weights(p))
  const baselineRows = score(dev, keys, () => baseline)
  const uniformRows = score(dev, keys, () => Array<number>(26).fill(1 / 26))
  const comparison = compare(ppmRows, baselineRows)
  const devPass =
    comparison.improvementBits >= protocol.devGate.improvementBits &&
    comparison.ci95[0] > 0 &&
    Object.values(comparison.bySource).every((n) => n >= -protocol.devGate.maxSourceRegressionBits)
  writeFileSync(join(directory, 'model.json'), serialized)
  writeFileSync(join(directory, 'unigram.json'), baselineSerialized)
  writeJson(join(directory, 'development.json'), {
    winner,
    unigram,
    comparison,
    devPass,
    candidates,
    unigrams,
    ppm: summarize(ppmRows),
    baseline: summarize(baselineRows),
    uniform: summarize(uniformRows),
    maxParityError,
    elapsedSeconds: (performance.now() - started) / 1000
  })
  writeJson(join(directory, 'benchmark.json'), benchmark(serialized, dev))
  writeJson(join(directory, 'freeze.json'), {
    run,
    modelHash: hash(serialized),
    baselineHash: hash(baselineSerialized),
    protocolHash,
    codeHashes: hashes,
    sourceHashes,
    config: winner.config,
    unigramConfig: unigram.config,
    devPass,
    createdAt: new Date().toISOString()
  } satisfies Freeze)
  console.log(JSON.stringify({ run, winner, unigram, comparison, devPass, directory }, null, 2))
}

function currentRun(): {
  directory: string
  freeze: Freeze
  model: FrozenInitialsPpm
  baseline: number[]
} {
  const { run } = readJson<{ run: string }>(join(outputDirectory, 'latest.json'))
  const directory = join(outputDirectory, run)
  const freeze = readJson<Freeze>(join(directory, 'freeze.json'))
  const raw = readFileSync(join(directory, 'model.json'), 'utf8')
  const baseline = readFileSync(join(directory, 'unigram.json'), 'utf8')
  if (
    hash(raw) !== freeze.modelHash ||
    hash(baseline) !== freeze.baselineHash ||
    hash(JSON.stringify(protocol)) !== freeze.protocolHash ||
    JSON.stringify(codeHashes()) !== JSON.stringify(freeze.codeHashes)
  )
    throw new Error(
      'Frozen model, baseline, protocol, or evaluation code changed; final scoring refused'
    )
  const acquired = readJson<Acquisition[]>(join(cacheDirectory, 'sources.json'))
  for (const [id, expected] of Object.entries(freeze.sourceHashes)) {
    if (
      hash(readFileSync(join(cacheDirectory, id + '.txt'))) !== expected ||
      !acquired.some((s) => s.id === id && s.sha256 === expected)
    )
      throw new Error(`Frozen training/development source changed: ${id}`)
  }
  return {
    directory,
    freeze,
    model: new FrozenInitialsPpm(JSON.parse(raw)),
    baseline: JSON.parse(baseline).probabilities
  }
}

function finalTest(): void {
  const { directory, freeze, model, baseline } = currentRun()
  const path = join(directory, 'final.json')
  if (existsSync(path)) {
    console.log(`Final test already recorded; refusing to overwrite: ${path}`)
    return
  }
  if (!freeze.devPass) {
    console.log('Development gate failed. Final data remains unscored; inspect development.json.')
    return
  }
  const acquired = acquire('test')
  writeJson(
    join(directory, 'final-acquisition.json'),
    acquired.filter((s) => ['aac-test', 'comm2'].includes(s.id))
  )
  const messages = loadMessages(true),
    keys = trainingKeys(messages)
  const tests = messages.filter((m) => m.split === 'test')
  const ppm = score(tests, keys, (p) => model.weights(p))
  const unigram = score(tests, keys, () => baseline)
  const uniform = score(tests, keys, () => Array<number>(26).fill(1 / 26))
  const comparisons: Record<
    string,
    { vsUnigram: Comparison; vsUniform: Comparison; fullVsUnigram: Comparison }
  > = {}
  for (const source of ['aac', 'turk', 'comm2']) {
    const select = (rows: ScoredMessage[]): ScoredMessage[] =>
      rows.filter((m) => m.source === source)
    comparisons[source] = {
      vsUnigram: compare(select(ppm), select(unigram)),
      vsUniform: compare(select(ppm), select(uniform)),
      fullVsUnigram: compare(select(ppm), select(unigram), 'full')
    }
  }
  const finalPass =
    comparisons.comm2.vsUnigram.ci95[0] > 0 &&
    comparisons.comm2.vsUniform.ci95[0] > 0 &&
    comparisons.aac.vsUnigram.improvementBits >= -0.05 &&
    comparisons.turk.vsUnigram.improvementBits >= -0.05
  writeJson(path, {
    modelHash: freeze.modelHash,
    finalPass,
    comparisons,
    data: dataSummary(tests, keys),
    ppm: summarize(ppm),
    unigram: summarize(unigram),
    uniform: summarize(uniform),
    note: 'One frozen offline evaluation. No engine, gaze, or natural AAC user validation.'
  })
  console.log(JSON.stringify({ finalPass, comparisons, path }, null, 2))
}

function report(): void {
  const { directory, freeze } = currentRun()
  const dev = readJson<{
    comparison: Comparison
    devPass: boolean
    ppm: Record<string, { bits: number; top3: number; targets: number }>
    baseline: Record<string, { bits: number }>
  }>(join(directory, 'development.json'))
  const finalPath = join(directory, 'final.json')
  const final = existsSync(finalPath)
    ? readJson<{
        finalPass: boolean
        comparisons: Record<string, { vsUnigram: Comparison }>
        ppm: typeof dev.ppm
        unigram: typeof dev.baseline
      }>(finalPath)
    : null
  const lines = [
    '# Initials PPM offline results',
    '',
    `Run: \`${freeze.run}\`. Model SHA-256: \`${freeze.modelHash}\`.`,
    '',
    `Frozen configuration: maximum history ${freeze.config.maxHistory}, AAC weight ${freeze.config.aacWeight}, uniform mixture ${freeze.config.floor}.`,
    '',
    `Development promotion gate: **${dev.devPass ? 'PASS' : 'FAIL'}**. Final offline gate: **${final ? (final.finalPass ? 'PASS' : 'FAIL') : 'NOT RUN'}**.`,
    '',
    'Lower bits per initial means more probability on the intended next letter. It does not measure typing speed.',
    '',
    '| Split, unseen full text | Initials | Uniform bits | Unigram bits | PPM bits | PPM top-3 | Improvement vs unigram, 95% CI |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- |'
  ]
  for (const source of ['aac', 'turk', ...(final ? ['comm2'] : [])]) {
    const stages = source === 'comm2' ? ['test'] : final ? ['dev', 'test'] : ['dev']
    for (const stage of stages) {
      const key = `${source}/unseenText`
      const p = stage === 'dev' ? dev.ppm[key] : final!.ppm[key]
      const b = stage === 'dev' ? dev.baseline[key] : final!.unigram[key]
      const ci = stage === 'dev' ? null : final!.comparisons[source].vsUnigram
      lines.push(
        `| ${source} ${stage} | ${p.targets} | ${Math.log2(26).toFixed(3)} | ${b.bits.toFixed(3)} | ${p.bits.toFixed(3)} | ${(100 * p.top3).toFixed(1)}% | ${ci ? `${ci.improvementBits.toFixed(3)} [${ci.ci95.map((n) => n.toFixed(3)).join(', ')}]` : 'See balanced development comparison below'} |`
      )
    }
  }
  lines.push(
    '',
    `Balanced development improvement: ${dev.comparison.improvementBits.toFixed(3)} bits/initial; 95% CI [${dev.comparison.ci95.map((n) => n.toFixed(3)).join(', ')}].`,
    '',
    'Full splits, unseen-initial-string subsets, first-24 targets, per-position and per-letter metrics are in development.json and final.json. Intervals use 2,000 paired bootstrap resamples, grouping Turk turns by dialogue; AAC/COMM2 use messages, which does not account for unexposed worker/scenario dependence.',
    '',
    'Training repeats are retained. No test/development refit or online updates were performed. COMM2 was acquired only after freezing. Dataset sources are crowdsourced invented messages, not naturally occurring AAC conversations.',
    '',
    'This artifact is for local review. Current dataset pages list CC BY 4.0; older Turk/COMM2 READMEs list BY-ND. Resolve that discrepancy before distribution. Dasher integration, engine reachability, and gaze trials remain outstanding.',
    ''
  )
  writeFileSync(join(directory, 'report.md'), lines.join('\n'))
  console.log(lines.join('\n'))
}

const command = process.argv[2]
try {
  if (command === 'prepare') {
    acquire('prepare')
    const messages = loadMessages()
    console.log(
      JSON.stringify(
        dataSummary(
          messages.filter((m) => m.split !== 'test'),
          trainingKeys(messages)
        ),
        null,
        2
      )
    )
  } else if (command === 'train') train()
  else if (command === 'test') finalTest()
  else if (command === 'report') report()
  else throw new Error('Usage: npm run ppm -- prepare|train|test|report')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
