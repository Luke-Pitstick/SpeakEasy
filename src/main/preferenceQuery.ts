import { z } from 'zod'
import {
  compositionContextPriority,
  EXPANSION_MODEL,
  MODEL_REASONING,
  type PredictionRequest
} from '../shared/prediction'
import { postModelJson } from './modelJson'

const querySchema = z.object({ query: z.string().max(500) }).strict()

/** The cache key and provider payload share exactly the same semantic inputs. */
export function preferenceQueryContext(request: PredictionRequest): string {
  return JSON.stringify({
    historicalSummary: request.conversationSummary ?? '',
    recentTurns: request.conversation.map(({ speaker, text }) => ({ speaker, text })),
    draft: request.draft,
    lockedMessage: request.lockedMessage,
    lockedWords: request.tokens.filter((t) => t.kind === 'word').map((t) => t.value)
  })
}

/** Resolve the current subject before embedding, without exposing saved facts to the resolver. */
export async function resolvePreferenceQuery(
  key: string,
  request: PredictionRequest,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch
): Promise<string> {
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
        json_schema: { name: 'preference_query', strict: true, schema: z.toJSONSchema(querySchema) }
      },
      messages: [
        {
          role: 'system',
          content: `Write one short semantic search query for personal preferences relevant to the CURRENT reply in an AAC conversation. This is query resolution, not sentence expansion or an answer. ${compositionContextPriority(request.lockedMessage)} Resolve elliptical follow-ups such as "which would you pick?" using that priority. If lockedWords indicate a different subject from lockedMessage, build the query around those explicit words and omit the incompatible earlier topic completely. Never invent a relationship between unrelated subjects to reconcile them. Distinguish the unsent lockedMessage from a draft that may contain previously spoken text; the unsent authored thought takes precedence over a newer unrelated partner question. Do not combine unrelated old topics into the query. Describe the subject and preference being sought, not the remembered answer: never copy preference values from the summary merely to retrieve themselves. Do not invent topics, preferences, or knowledge. Preserve negation and speaker attribution. Return {"query":""} if no current subject can be established. Return JSON only.`
        },
        {
          role: 'user',
          content: preferenceQueryContext(request)
        }
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
            message: z.object({ content: z.string().max(4000) })
          })
        )
        .min(1)
    })
    .parse(response)
  return querySchema.parse(JSON.parse(envelope.choices[0].message.content)).query.trim()
}
