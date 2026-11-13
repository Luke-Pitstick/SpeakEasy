// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import type {
  DebugContext,
  DebugKind,
  DebugSnapshot,
  GenerationTrace,
  TranscriptLogEntry
} from '../shared/diagnostics'

const empty = (enabled: boolean): DebugSnapshot => ({
  enabled,
  context: null,
  events: [],
  transcripts: [],
  generations: []
})

/**
 * Bounded, session-only traces captured while debug mode is on. Never writes audio, keys, or
 * data to disk; turning debug mode off deletes everything captured.
 */
export class DiagnosticStore {
  private state: DebugSnapshot = empty(false)
  private sequence = 0
  get enabled(): boolean {
    return this.state.enabled
  }
  setEnabled(enabled: boolean): void {
    if (enabled === this.state.enabled) return
    this.state = empty(enabled)
  }
  clear(): void {
    this.state = empty(this.state.enabled)
  }
  context(context: DebugContext): void {
    if (!this.state.enabled) return
    if (this.state.context && this.state.context.epoch !== context.epoch) this.clear()
    if (JSON.stringify(this.state.context) === JSON.stringify(context)) return
    this.state.context = structuredClone(context)
    this.record('context', context)
  }
  record(kind: DebugKind, data: unknown, requestId?: string): void {
    if (!this.state.enabled) return
    this.state.events.push({
      sequence: ++this.sequence,
      at: Date.now(),
      kind,
      requestId,
      data: JSON.stringify(data, null, 2).slice(0, 50000)
    })
    this.state.events = this.state.events.slice(-150)
  }
  transcript(entry: Omit<TranscriptLogEntry, 'at'>): void {
    if (!this.state.enabled) return
    this.state.transcripts.push({ ...entry, text: entry.text.slice(0, 8000), at: Date.now() })
    this.state.transcripts = this.state.transcripts.slice(-200)
  }
  /** Starts or replaces the trace for one expansion request. */
  generation(trace: Omit<GenerationTrace, 'at'>): void {
    if (!this.state.enabled) return
    const list = this.state.generations.filter((g) => g.requestId !== trace.requestId)
    list.push(structuredClone({ ...trace, at: Date.now() }))
    this.state.generations = list.slice(-50)
  }
  /** Merges a later stage into a still-pending trace; finished or unknown requests are ignored. */
  updateGeneration(requestId: string, patch: Partial<Omit<GenerationTrace, 'requestId'>>): void {
    const trace = this.state.generations.find((g) => g.requestId === requestId)
    if (trace?.status === 'pending') Object.assign(trace, structuredClone(patch))
  }
  appendReasoning(requestId: string, text: string): void {
    const trace = this.state.generations.find((g) => g.requestId === requestId)
    if (trace) trace.reasoning.model = (trace.reasoning.model + text).slice(0, 20000)
  }
  read(): DebugSnapshot {
    return structuredClone(this.state)
  }
}
export const diagnostics = new DiagnosticStore()
