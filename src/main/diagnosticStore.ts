import type { DebugContext, DebugKind, DebugSnapshot } from '../shared/diagnostics'

/** Opt-in, bounded, session-only traces. Never writes audio, keys, or data to disk. */
export class DiagnosticStore {
  private state: DebugSnapshot = { enabled: false, context: null, events: [] }
  private sequence = 0
  start(context: DebugContext): void {
    this.state.enabled = true
    this.context(context)
  }
  stop(): void {
    this.state = { enabled: false, context: null, events: [] }
  }
  clear(): void {
    this.state.context = null
    this.state.events = []
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
  read(): DebugSnapshot {
    return structuredClone(this.state)
  }
}
export const diagnostics = new DiagnosticStore()
