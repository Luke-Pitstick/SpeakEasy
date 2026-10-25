import { expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'
import { openMossMemory, modelContextResolver } from '../src/main/mossMemory'
import { streamGemini } from '../src/main/gemini'
import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'

// Explicit opt-in: only fictional preference text is sent to the configured providers.
it.skipIf(process.env.SPEAKEASY_LIVE_MEMORY_TEST !== '1').each([
  {
    name: 'deck assertion',
    text: 'My favorite deck is Hog Cycle',
    question: 'What is your favorite deck in Clash Royale?',
    value: 'Hog Cycle',
    initials: 'iphc'
  },
  {
    name: 'short sushi answer',
    text: 'Salmon roll',
    question: 'What is your favorite sushi roll?',
    value: 'Salmon roll',
    initials: 'sr'
  }
])(
  'automatically learns, persists, retrieves, and forgets: $name',
  async (scenario) => {
    const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
    const key = env.OPENROUTER_TOKEN
    if (!key || !env.MOSS_PROJECT_ID || !env.MOSS_PROJECT_TOKEN)
      throw Error('Configure OpenRouter and Moss credentials for the live memory test')
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-live-preference-'))
    const path = join(folder, 'preferences.sqlite')
    let service = new PreferenceService(
      new PreferenceStore(path),
      key,
      () => {},
      () => true
    )
    let runtime: Awaited<ReturnType<typeof openMossMemory>> | undefined
    const input: PredictionRequest = {
      id: 'explicit',
      revision: 1,
      purpose: 'expansion',
      lockedMessage: '',
      draft: '',
      target: { start: 0, end: 0 },
      tokens: [...scenario.initials].map((value, i) => ({ id: String(i), kind: 'initial', value })),
      conversation: [
        {
          id: 'partner',
          speaker: 'partner',
          text: scenario.question
        }
      ]
    }
    try {
      await service.update({ type: 'settings', retrieve: false })
      await service.update({
        type: 'commit',
        id: 'clash-example',
        text: scenario.text,
        conversation: [{ speaker: 'partner', text: scenario.question }]
      })
      await expect.poll(() => service.read().busy, { timeout: 30000 }).toBe(false)
      expect(service.read().error).toBe('')
      const proposal = service
        .read()
        .facts.find((p) => p.fact.value.toLowerCase() === scenario.value.toLowerCase())
      expect(proposal).toBeDefined()
      await service.update({ type: 'settings', retrieve: true })
      service.close()
      service = new PreferenceService(
        new PreferenceStore(path),
        key,
        () => {},
        () => true
      )
      expect(service.read().facts[0].fact.value).toBe(scenario.value)
      runtime = await openMossMemory(
        env.MOSS_PROJECT_ID,
        env.MOSS_PROJECT_TOKEN,
        modelContextResolver(key)
      )
      const signal = AbortSignal.timeout(90000)
      const bundle = await runtime.memory.retrieve(
        input,
        input.conversation,
        service.read().facts,
        signal
      )
      expect(bundle.factIds).toEqual([proposal!.id])
      const results: PredictionResult[] = []
      await streamGemini(
        bundle.request,
        key,
        signal,
        (r) => results.push(r),
        fetch,
        { vocabulary: [], examples: [], facts: bundle.facts },
        [],
        undefined,
        bundle.context
      )
      const result = results.at(-1)
      expect(result?.status).toBe('success')
      if (result?.status !== 'success') throw Error('No successful generation')
      expect(
        result.candidates.some((c) => c.text.toLowerCase().includes(scenario.value.toLowerCase()))
      ).toBe(true)
      await service.update({ type: 'forget', id: proposal!.id })
      await runtime.memory.reconcile(input.conversation, service.read().facts)
      const forgotten = await runtime.memory.retrieve(
        input,
        input.conversation,
        service.read().facts,
        signal
      )
      expect(forgotten.facts).toEqual([])
      console.info(
        'Live memory lifecycle: automatic extraction, restart, Moss retrieval, generation, and forgetting passed'
      )
    } finally {
      await runtime?.close()
      service.close()
      rmSync(folder, { recursive: true, force: true })
    }
  },
  180000
)
