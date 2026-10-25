import { z } from 'zod'
import type { ConversationTurn } from './prediction'

export const conversationHistorySchema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(100),
        speaker: z.enum(['me', 'partner']),
        text: z.string().min(1).max(1000)
      })
      .strict()
  )
  .max(500)
  .refine((turns) => new Set(turns.map((t) => t.id)).size === turns.length)
  .refine((turns) => turns.reduce((n, t) => n + t.text.length, 0) <= 250000)

export function boundConversationHistory(turns: ConversationTurn[]): ConversationTurn[] {
  let length = 0
  const kept: ConversationTurn[] = []
  for (const turn of turns.slice(-500).reverse()) {
    if (!turn.text.trim()) continue
    if (length + turn.text.length > 250000) break
    kept.push(turn)
    length += turn.text.length
  }
  return kept.reverse()
}
