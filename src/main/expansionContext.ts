import { z } from 'zod'
import { expansionContextSchema, type ExpansionContext } from '../shared/expansionContext'
import {
  compositionContextPriority,
  EXPANSION_MODEL,
  MODEL_REASONING,
  type PredictionRequest
} from '../shared/prediction'
import { preferenceQueryContext } from './preferenceQuery'
import { postModelJson } from './modelJson'
import { diagnostics } from './diagnosticStore'

/** One completed topic plan per session; initials never invalidate it. */
export class ExpansionContextCache {
  private entry: { key: string; plan?: ExpansionContext } | null = null
  clear(): void {
    this.entry = null
  }
  async resolve(
    request: PredictionRequest,
    key: string,
    signal: AbortSignal,
    fetcher: typeof fetch = fetch
  ): Promise<ExpansionContext | null> {
    if (
      request.purpose !== 'expansion' ||
      signal.aborted ||
      !(
        request.conversation.length ||
        request.lockedMessage.trim() ||
        request.conversationSummary?.trim()
      )
    )
      return null
    const context = preferenceQueryContext(request)
    if (this.entry?.key !== context) this.entry = { key: context }
    const entry = this.entry
    if (entry.plan) {
      diagnostics.record('topic', { cacheHit: true, ...entry.plan }, request.id)
      return entry.plan
    }
    try {
      const response = await postModelJson(
        key,
        'chat/completions',
        {
          model: EXPANSION_MODEL,
          temperature: 0,
          max_tokens: 2048,
          reasoning: MODEL_REASONING,
          provider: { sort: 'latency' },
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'expansion_context',
              strict: true,
              schema: z.toJSONSchema(expansionContextSchema)
            }
          },
          messages: [
            {
              role: 'system',
              content: `Prepare context for an AAC user's next reply. ${compositionContextPriority(request.lockedMessage)} Identify the active topic, the time frame appropriate for this reply, and its likely conversational purpose (for example answering a question or explaining a previous opinion). Build a compact vocabulary of relevant specific subjects, subtopics, activities, and descriptive words a person might use in that reply. Include common specific branches of a broad topic even if not explicitly named. These are possible vocabulary choices, never claims about the user's beliefs or experiences. Focus ONLY on the current topic; exclude unrelated past or background topics. Preserve speaker attribution and negation. Do not expand initials or write candidate sentences. Return the requested JSON.`
            },
            { role: 'user', content: context }
          ]
        },
        signal,
        fetcher
      )
      const envelope = z
        .object({
          choices: z
            .array(
              z.object({
                finish_reason: z.literal('stop'),
                message: z.object({ content: z.string().max(6000) })
              })
            )
            .min(1)
        })
        .parse(response)
      const plan = expansionContextSchema.parse(JSON.parse(envelope.choices[0].message.content))
      if (signal.aborted || this.entry !== entry) return null
      entry.plan = plan
      diagnostics.record('topic', { cacheHit: false, ...plan }, request.id)
      return plan
    } catch {
      if (!signal.aborted)
        diagnostics.record(
          'topic',
          { error: 'Topic preparation unavailable; using original conversation context' },
          request.id
        )
      return null
    }
  }
}
