// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { z } from 'zod'

export const expansionContextSchema = z
  .object({
    topic: z.string().max(300),
    timeFrame: z.enum(['past', 'present', 'future', 'unspecified']),
    replyIntent: z.string().max(400),
    vocabulary: z.array(z.string().min(1).max(60)).max(30)
  })
  .strict()
export type ExpansionContext = z.infer<typeof expansionContextSchema>
