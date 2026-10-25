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
it.skipIf(process.env.SPEAKEASY_LIVE_MEMORY_TEST !== '1')(
  'extracts, persists, retrieves, and forgets an approved fact using Moss and real providers',
  async () => {
    const env = { ...parseEnv(readFileSync('.env', 'utf8')), ...process.env }
    const key = env.OPENROUTER_TOKEN
    if (!key || !env.MOSS_PROJECT_ID || !env.MOSS_PROJECT_TOKEN)
      throw Error('Configure OpenRouter and Moss credentials for the live memory test')
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-live-preference-'))
    const path = join(folder, 'preferences.sqlite')
    let service = new PreferenceService(new PreferenceStore(path), key, () => {})
    let runtime: Awaited<ReturnType<typeof openMossMemory>> | undefined
    const input: PredictionRequest = {
      id: 'explicit',
      revision: 1,
      purpose: 'expansion',
      lockedMessage: '',
      draft: '',
      target: { start: 0, end: 0 },
      tokens: [...'iphc'].map((value, i) => ({ id: String(i), kind: 'initial', value })),
      conversation: [
        {
          id: 'partner',
          speaker: 'partner',
          text: 'Which deck do you usually use in Clash Royale?'
        }
      ]
    }
    try {
      await service.update({ type: 'settings', extract: true, retrieve: false })
      await service.update({
        type: 'commit',
        id: 'clash-example',
        text: 'My favorite deck is Hog Cycle',
        conversation: [{ speaker: 'partner', text: 'What is your favorite deck in Clash Royale?' }]
      })
      await expect.poll(() => service.read().busy, { timeout: 30000 }).toBe(false)
      expect(service.read().error).toBe('')
      const proposal = service
        .read()
        .proposals.find((p) => p.fact.value.toLowerCase() === 'hog cycle')
      expect(proposal).toBeDefined()
      expect(service.read().facts).toEqual([])
      await service.update({
        type: 'approve',
        id: proposal!.id,
        fact: proposal!.fact,
        replaceId: null
      })
      await service.update({ type: 'settings', extract: true, retrieve: true })
      service.close()
      service = new PreferenceService(new PreferenceStore(path), key, () => {})
      expect(service.read().facts[0].fact.value).toBe('Hog Cycle')
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
      expect(result.candidates.some((c) => /hog cycle/i.test(c.text))).toBe(true)
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
        'Live memory lifecycle: extraction, approval, restart, Moss retrieval, generation, and forgetting passed'
      )
    } finally {
      await runtime?.close()
      service.close()
      rmSync(folder, { recursive: true, force: true })
    }
  },
  180000
)
