import { expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'
import { streamGemini } from '../src/main/gemini'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import { summarizeConversation } from '../src/main/conversationSummary'
import { cosine } from '../src/main/preferenceProvider'
import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'

// Explicit opt-in: this test sends only the synthetic scenario below to paid providers.
it.skipIf(process.env.SPEAKEASY_LIVE_MEMORY_TEST !== '1')(
  'learns and uses the Clash Royale preference with real providers',
  async () => {
    const key =
      process.env.OPENROUTER_TOKEN || parseEnv(readFileSync('.env', 'utf8')).OPENROUTER_TOKEN
    if (!key) throw Error('Configure OPENROUTER_TOKEN to run the opt-in live memory test')
    const folder = mkdtempSync(join(tmpdir(), 'speakeasy-live-preference-'))
    const path = join(folder, 'preferences.sqlite')
    const calls: { endpoint: string; status: number; elapsedMs: number }[] = []
    let expansionFacts: unknown
    const embeddings: { input: string; vector: number[] }[] = []
    const liveFetch: typeof fetch = async (url, init) => {
      const started = performance.now()
      const body = JSON.parse(String(init?.body))
      if (body.stream) expansionFacts = JSON.parse(body.messages[1].content).personalMemory.facts
      const response = await fetch(url, init).catch((error: unknown) => {
        console.info(
          'Provider request failed',
          body.response_format?.json_schema?.name ?? body.model,
          Math.round(performance.now() - started),
          error instanceof Error ? error.name : 'Unknown error'
        )
        throw error
      })
      if (response.ok && body.messages && !body.stream) {
        const result = await response.clone().json()
        console.info(
          'Structured response',
          body.response_format?.json_schema?.name,
          result.choices?.[0]?.finish_reason,
          {
            contentLength: result.choices?.[0]?.message?.content?.length ?? 0,
            reasoningTokens: result.usage?.completion_tokens_details?.reasoning_tokens,
            elapsedMs: Math.round(performance.now() - started)
          }
        )
      }
      calls.push({
        endpoint: String(url).split('/').at(-1)!,
        status: response.status,
        elapsedMs: Math.round(performance.now() - started)
      })
      if (!response.ok) {
        const failure = await response
          .clone()
          .json()
          .catch(() => null)
        console.info(
          'Provider failure',
          response.status,
          String(failure?.error?.message ?? '')
            .replaceAll(key, '[redacted]')
            .slice(0, 500)
        )
      }
      if (response.ok && String(url).endsWith('/embeddings')) {
        const result = await response.clone().json()
        embeddings.push({ input: body.input, vector: result.data[0].embedding })
      }
      return response
    }
    let service = new PreferenceService(new PreferenceStore(path), key, () => {}, liveFetch)
    const request = (id: string, question: string): PredictionRequest => ({
      id,
      revision: 1,
      purpose: 'expansion',
      lockedMessage: '',
      draft: '',
      target: { start: 0, end: 0 },
      tokens: [...'iphc'].map((value, i) => ({ id: String(i), kind: 'initial', value })),
      conversation: [{ id: 'partner', speaker: 'partner', text: question }]
    })
    try {
      await service.update({ type: 'settings', extract: true, retrieve: false })
      await service.update({
        type: 'commit',
        id: 'clash-example',
        text: 'My favorite deck is Hog Cycle',
        conversation: [{ speaker: 'partner', text: 'What is your favorite deck in Clash Royale?' }]
      })
      const deadline = Date.now() + 15000
      while (service.read().busy && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 100))
      const pending = service.read()
      expect(pending.error).toBe('')
      const proposal = pending.proposals.find((p) => p.fact.value.toLowerCase() === 'hog cycle')
      expect(proposal).toBeDefined()
      expect(proposal!.fact.relationship).toBe('favorite_deck')
      expect(proposal!.fact.scope.game).toBe('Clash Royale')
      expect(pending.facts).toEqual([])
      console.info('Extracted proposal', JSON.stringify(proposal))
      // The human explicitly supplied this preference; approve only the verified matching proposal.
      await service.update({
        type: 'approve',
        id: proposal!.id,
        fact: proposal!.fact,
        replaceId: null
      })
      await service.update({ type: 'settings', extract: true, retrieve: true })
      expect(service.read().error).toBe('')
      expect(service.read().unindexed).toBe(0)
      service.close()
      service = new PreferenceService(new PreferenceStore(path), key, () => {}, liveFetch)
      expect(service.read().facts[0].fact.value).toBe('Hog Cycle')
      let retainedConversation: PredictionRequest | undefined
      for (const [id, question] of [
        ['explicit', 'Which deck do you usually use in Clash Royale?'],
        ['paraphrase', 'What do you usually run when we battle?']
      ]) {
        const input = request(id, question)
        if (id === 'paraphrase') {
          let state = reducer(initialState(), {
            type: 'conversation-add',
            speaker: 'partner',
            text: 'What is your favorite deck in Clash Royale?'
          })
          state = reducer(state, { type: 'mode', mode: 'literal' })
          state = reducer(state, { type: 'input', text: 'My favorite deck is Hog Cycle' })
          state = reducer(state, { type: 'lock-sentence' })
          state = reducer(state, {
            type: 'speech-completed',
            text: state.draft,
            revision: state.revision
          })
          state = reducer(state, { type: 'clear' })
          state = reducer(state, {
            type: 'conversation-add',
            speaker: 'partner',
            text: 'Sounds good.'
          })
          state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: question })
          for (let i = 0; i < 8; i++)
            state = reducer(state, {
              type: 'conversation-add',
              speaker: 'partner',
              text: 'Okay, go on.'
            })
          const summary = await summarizeConversation(
            key,
            { summary: state.conversationSummary, turns: state.summaryPending.slice(0, 8) },
            new AbortController().signal,
            liveFetch
          )
          state = reducer(state, {
            type: 'summary-result',
            version: state.summaryVersion,
            ids: state.summaryPending.slice(0, 8).map((t) => t.id),
            summary
          })
          expect(summary).toContain('Clash Royale')
          state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: question })
          expect(
            state.conversation.every(
              (turn) => !turn.text.includes('Clash Royale') && !turn.text.includes('Hog Cycle')
            )
          ).toBe(true)
          input.conversationSummary = state.conversationSummary
          input.conversation = state.conversation
          retainedConversation = input
        }
        const facts = await service.retrieve(input, new AbortController().signal)
        console.info('Retrieved', id, JSON.stringify(facts), service.read().error)
        expect(facts.some((f) => f.value === 'Hog Cycle')).toBe(true)
        const results: PredictionResult[] = []
        await streamGemini(
          input,
          key,
          new AbortController().signal,
          (result) => results.push(result),
          liveFetch,
          { vocabulary: [], examples: [], facts }
        )
        const final = results.at(-1)
        expect(final?.status, JSON.stringify(final)).toBe('success')
        const candidates = final?.status === 'success' ? final.candidates.map((c) => c.text) : []
        console.info('Live expansions', id, JSON.stringify(candidates))
        expect(expansionFacts).toEqual(facts)
        expect(candidates.some((text) => /\bhog cycle\b/i.test(text))).toBe(true)
      }
      const dinner = {
        ...retainedConversation!,
        id: 'topic-switch-dinner',
        conversation: [
          ...retainedConversation!.conversation.slice(-7),
          {
            id: 'dinner-question',
            speaker: 'partner' as const,
            text: 'What would you like for dinner: hot chicken or pasta?'
          }
        ]
      }
      const followup = {
        ...dinner,
        id: 'dinner-followup',
        conversation: [
          ...dinner.conversation.slice(-7),
          { id: 'dinner-followup', speaker: 'partner' as const, text: 'Which would you pick?' }
        ]
      }
      const returnToGame = {
        ...followup,
        id: 'return-to-game',
        conversation: [
          ...followup.conversation.slice(-7),
          {
            id: 'game-return',
            speaker: 'partner' as const,
            text: 'Back to Clash Royale: which deck do you prefer?'
          }
        ]
      }
      const continuingGame = {
        ...dinner,
        id: 'locked-game-over-background-dinner',
        lockedMessage:
          'I have been playing Clash Royale. I want to tell you about my favorite deck.'
      }
      const continuingDinner = {
        ...returnToGame,
        id: 'locked-dinner-over-background-game',
        lockedMessage:
          "I'm deciding what to eat for dinner. I'm choosing between hot chicken and pasta."
      }
      const authoredShift = {
        ...continuingGame,
        id: 'authored-shift-to-dinner',
        lockedMessage:
          'I have been playing Clash Royale. Now I want to talk about dinner: hot chicken or pasta.'
      }
      const explicitWords = {
        ...continuingGame,
        id: 'explicit-dinner-words',
        tokens: continuingGame.tokens.map((token, i) =>
          i === 2
            ? { ...token, kind: 'word' as const, value: 'hot' }
            : i === 3
              ? { ...token, kind: 'word' as const, value: 'chicken' }
              : token
        )
      }
      for (const input of [
        dinner,
        followup,
        returnToGame,
        continuingGame,
        continuingDinner,
        authoredShift,
        explicitWords
      ]) {
        expect(input.conversationSummary).toContain('Clash Royale')
        const facts = await service.retrieve(input, new AbortController().signal)
        const callsBeforeRepeat = calls.length
        const repeated = await service.retrieve(
          {
            ...input,
            id: `${input.id}-repeat`,
            revision: input.revision + 1,
            tokens: input.tokens.map((token, i) =>
              token.kind === 'word' ? token : { ...token, value: i === 0 ? 'w' : token.value }
            )
          },
          new AbortController().signal
        )
        expect(repeated).toEqual(facts)
        expect(calls.length).toBe(callsBeforeRepeat)
        const results: PredictionResult[] = []
        await streamGemini(
          input,
          key,
          new AbortController().signal,
          (result) => results.push(result),
          liveFetch,
          { vocabulary: [], examples: [], facts }
        )
        const final = results.at(-1)
        expect(final?.status, JSON.stringify(final)).toBe('success')
        const candidates =
          final?.status === 'success' ? final.candidates.map((candidate) => candidate.text) : []
        console.info(
          'Topic switch evidence',
          JSON.stringify({ id: input.id, query: embeddings.at(-1)?.input, facts, candidates })
        )
        expect(candidates.length).toBeGreaterThan(0)
        if (input.id === 'return-to-game' || input.id === 'locked-game-over-background-dinner') {
          expect(facts.some((f) => f.value === 'Hog Cycle')).toBe(true)
          expect(candidates.some((text) => /hog cycle/i.test(text))).toBe(true)
        } else {
          expect(facts).toEqual([])
          expect(candidates.some((text) => /hog cycle|clash royale/i.test(text))).toBe(false)
          expect(candidates.some((text) => /hot chicken/i.test(text))).toBe(true)
        }
      }
      const unrelated = await service.retrieve(
        request('unrelated', 'What would you like for dinner?'),
        new AbortController().signal
      )
      console.info('Unrelated dinner retrieval', JSON.stringify(unrelated))
      expect(unrelated).toEqual([])
      await service.update({ type: 'forget', id: proposal!.id })
      expect(
        await service.retrieve(
          request('forgotten', 'Which deck do you use in Clash Royale?'),
          new AbortController().signal
        )
      ).toEqual([])
      console.info('Live provider calls', JSON.stringify(calls))
      console.info(
        'Measured semantic similarities',
        JSON.stringify(
          embeddings.slice(1).map((item) => ({
            query: item.input,
            cosine: cosine(embeddings[0].vector, item.vector)
          }))
        )
      )
    } finally {
      service.close()
      rmSync(folder, { recursive: true, force: true })
    }
  },
  90000
)
