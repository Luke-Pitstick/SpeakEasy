import { z } from 'zod'

export const conversationSummarySchema = z.object({ summary: z.string().max(2000) }).strict()
export const summaryRequestSchema = z
  .object({
    summary: z.string().max(2000),
    turns: z
      .array(
        z
          .object({
            id: z.string().min(1).max(100),
            speaker: z.enum(['me', 'partner']),
            text: z.string().min(1).max(1000)
          })
          .strict()
      )
      .min(1)
      .max(8)
  })
  .strict()
export type SummaryRequest = z.infer<typeof summaryRequestSchema>
