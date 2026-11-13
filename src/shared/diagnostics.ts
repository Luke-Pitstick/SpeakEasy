// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { z } from 'zod'
import type { ExpansionContext } from './expansionContext'
import type { ConversationTurn } from './prediction'
import type { PreferenceFields } from './preferences'

const turn = z.object({ speaker: z.enum(['me', 'partner']), text: z.string().max(1000) }).strict()
export const debugContextSchema = z
  .object({
    epoch: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    draft: z.string().max(2500),
    initials: z.string().max(1500),
    lockedMessage: z.string().max(2000),
    conversation: z.array(turn).max(8),
    retainedTurnCount: z.number().int().min(0).max(500),
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
/** One finalized speech-to-text turn heard from the conversation partner. */
export interface TranscriptLogEntry {
  at: number
  session: string
  id: string
  text: string
}
/** What one initials expansion received and produced, assembled across its pipeline stages. */
export interface GenerationTrace {
  requestId: string
  at: number
  acronym: string
  model: string
  status: 'pending' | 'complete' | 'error' | 'cancelled'
  message?: string
  cached: string[]
  /** Conversation context actually placed in the generation prompt. Null until retrieval ends. */
  shortTerm: {
    conversation: Pick<ConversationTurn, 'speaker' | 'text'>[]
    lockedMessage: string
    draft: string
  } | null
  /** Saved database (corrections) and Moss (personal facts) context included in the prompt. */
  longTerm: {
    query: string
    cacheHit: boolean
    facts: PreferenceFields[]
    vocabulary: string[]
    examples: { initials: string; text: string }[]
  } | null
  /** Context resolver decision, plus any reasoning text the generation model returned. */
  reasoning: { context: (ExpansionContext & { certain: boolean }) | null; model: string }
  candidates: string[]
}
export interface DebugSnapshot {
  enabled: boolean
  context: DebugContext | null
  events: DebugEvent[]
  transcripts: TranscriptLogEntry[]
  generations: GenerationTrace[]
}
export interface DiagnosticsApi {
  open(context: DebugContext): Promise<void>
  context(context: DebugContext): void
  read(): Promise<DebugSnapshot>
  clear(): Promise<void>
  /** Closes the debug window and returns focus to the main app; logs keep capturing. */
  close(): Promise<void>
}
