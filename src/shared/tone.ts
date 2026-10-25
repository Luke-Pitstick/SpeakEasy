import { z } from 'zod'
import { VOICE_TONES, type VoiceTone } from './voice'

export const toneRequestSchema = z.strictObject({
  id: z.string().regex(/^[\w-]{1,100}$/),
  revision: z.number().int().nonnegative(),
  contextEpoch: z.number().int().nonnegative(),
  text: z
    .string()
    .min(1)
    .max(2000)
    .refine((text) => !!text.trim() && !/[<>]/.test(text)),
  conversation: z
    .array(
      z.strictObject({
        speaker: z.enum(['me', 'partner']),
        text: z.string().min(1).max(1000)
      })
    )
    .max(8)
})
export type ToneRequest = z.infer<typeof toneRequestSchema>
export const emotionProposalSchema = z.strictObject({
  requestId: z.string(),
  revision: z.number().int().nonnegative(),
  contextEpoch: z.number().int().nonnegative(),
  tone: z.enum(VOICE_TONES),
  confidence: z.number().min(0).max(1),
  model: z.string().min(1).max(100)
})
export type EmotionProposal = z.infer<typeof emotionProposalSchema>
export interface ToneStatus {
  configured: boolean
  enabled: boolean
}
export interface ToneApi {
  status(): Promise<ToneStatus>
  setEnabled(enabled: boolean): Promise<ToneStatus>
  suggest(request: ToneRequest): Promise<EmotionProposal>
  cancel(id: string): void
}
export interface ToneController extends ToneStatus {
  value: VoiceTone
  message: string
  setEnabled(enabled: boolean): void
  select(tone: VoiceTone): void
}
