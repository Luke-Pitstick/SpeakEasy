import { z } from 'zod'

const text = (max: number): z.ZodString => z.string().trim().min(1).max(max)
export const preferenceFieldsSchema = z.strictObject({
  type: z.literal('preference'),
  subject: z.literal('user'),
  relationship: text(80),
  value: text(160),
  scope: z.strictObject({ game: text(100).nullable(), topic: text(100).nullable() }),
  relatedTerms: z.array(text(60)).max(10)
})
export const preferenceProposalSchema = z.strictObject({
  fact: preferenceFieldsSchema,
  quote: text(500),
  scopeBasis: z.enum(['explicit', 'conversation', 'inferred']),
  scopeExplanation: z.string().max(300)
})
export const extractionSchema = z.strictObject({
  proposals: z.array(preferenceProposalSchema).max(5)
})
export const sentenceSchema = z.strictObject({
  id: text(150),
  text: text(500),
  initials: z.string().max(500),
  createdAt: z.number().int().nonnegative()
})
export const approvedPreferenceSchema = z.object({
  id: text(150),
  fact: preferenceFieldsSchema,
  source: sentenceSchema,
  quote: text(500),
  scopeBasis: z.enum(['explicit', 'conversation', 'inferred']),
  scopeExplanation: z.string().max(300),
  updatedAt: z.number().int().nonnegative()
})
export const preferenceOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('settings'), extract: z.boolean(), retrieve: z.boolean() }),
  z.strictObject({
    type: z.literal('commit'),
    id: text(150),
    text: text(500),
    conversation: z
      .array(z.strictObject({ speaker: z.enum(['me', 'partner']), text: text(1000) }))
      .max(8)
  }),
  z.strictObject({ type: z.literal('extract'), id: text(150) }),
  z.strictObject({
    type: z.literal('approve'),
    id: text(150),
    fact: preferenceFieldsSchema,
    replaceId: text(150).nullable()
  }),
  z.strictObject({ type: z.literal('edit'), id: text(150), fact: preferenceFieldsSchema }),
  z.strictObject({ type: z.literal('reject'), id: text(150) }),
  z.strictObject({ type: z.literal('forget'), id: text(150) }),
  z.strictObject({ type: z.literal('forget-sentences'), ids: z.array(text(150)).max(100) }),
  z.strictObject({ type: z.literal('clear') })
])
export type PreferenceFields = z.infer<typeof preferenceFieldsSchema>
export type PreferenceProposal = z.infer<typeof preferenceProposalSchema> & {
  id: string
  source: SentenceMemory
}
export type ApprovedPreference = z.infer<typeof approvedPreferenceSchema>
export type SentenceMemory = z.infer<typeof sentenceSchema>
export type PreferenceOperation = z.infer<typeof preferenceOperationSchema>
export interface PreferenceSnapshot {
  extract: boolean
  retrieve: boolean
  facts: ApprovedPreference[]
  proposals: PreferenceProposal[]
  sentences: SentenceMemory[]
  busy: boolean
  error: string
}
export interface PreferenceApi {
  read(): Promise<PreferenceSnapshot>
  update(operation: PreferenceOperation): Promise<PreferenceSnapshot>
  onChanged(listener: (invalidate: boolean) => void): () => void
}
export function preferenceText(fact: PreferenceFields): string {
  return `User ${fact.relationship}: ${fact.value}. Context: ${[fact.scope.game, fact.scope.topic].filter(Boolean).join(', ')}. Related: ${fact.relatedTerms.join(', ')}`
}
