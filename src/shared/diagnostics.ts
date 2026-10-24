import { z } from 'zod'

const turn = z.object({ speaker: z.enum(['me', 'partner']), text: z.string().max(1000) }).strict()
export const debugContextSchema = z
  .object({
    epoch: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    draft: z.string().max(2500),
    initials: z.string().max(1500),
    lockedMessage: z.string().max(2000),
    conversation: z.array(turn).max(8),
    summary: z.string().max(2000),
    pendingSummary: z.array(turn).max(100),
    partial: z.string().max(8000),
    queuedTranscripts: z.array(turn).max(8),
    listening: z.string().max(500),
    paused: z.boolean(),
    busy: z.boolean()
  })
  .strict()
export type DebugContext = z.infer<typeof debugContextSchema>
export type DebugKind =
  | 'topic'
  | 'context'
  | 'transcript'
  | 'listening'
  | 'request'
  | 'retrieval'
  | 'memory'
  | 'candidate'
  | 'result'
  | 'cancel'
export interface DebugEvent {
  sequence: number
  at: number
  kind: DebugKind
  requestId?: string
  data: string
}
export interface DebugSnapshot {
  enabled: boolean
  context: DebugContext | null
  events: DebugEvent[]
}
export interface DiagnosticsApi {
  open(context: DebugContext): Promise<void>
  context(context: DebugContext): void
  read(): Promise<DebugSnapshot>
  clear(): Promise<void>
}
