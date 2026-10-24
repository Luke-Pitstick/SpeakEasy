import { expect, it } from 'vitest'
import { DiagnosticStore } from '../src/main/diagnosticStore'
import { debugContextSchema, type DebugContext } from '../src/shared/diagnostics'

const context = (): DebugContext => ({
  epoch: 0,
  revision: 1,
  draft: '',
  initials: 'idlm',
  lockedMessage: '',
  conversation: [{ speaker: 'partner', text: 'What was your least favorite subject?' }],
  summary: '',
  pendingSummary: [],
  partial: '',
  queuedTranscripts: [],
  listening: 'Listening',
  paused: true,
  busy: false
})

it('captures only while explicitly enabled, bounds history, and deletes traces when closed', () => {
  const store = new DiagnosticStore()
  store.record('transcript', { text: 'private' })
  store.context(context())
  expect(store.read()).toEqual({ enabled: false, context: null, events: [] })
  store.start(context())
  for (let i = 0; i < 180; i++) store.record('candidate', { i }, 'request-1')
  expect(store.read().events).toHaveLength(150)
  const snapshot = store.read()
  snapshot.context!.conversation[0].text = 'mutated'
  expect(store.read().context?.conversation[0].text).not.toBe('mutated')
  store.stop()
  expect(store.read()).toEqual({ enabled: false, context: null, events: [] })
})

it('clears previous private context after conversation reset and supports explicit deletion', () => {
  const store = new DiagnosticStore()
  store.start(context())
  store.record('memory', { facts: ['private fact'] })
  store.context({ ...context(), epoch: 1, conversation: [] })
  expect(JSON.stringify(store.read())).not.toContain('private fact')
  expect(store.read().events).toHaveLength(1)
  store.clear()
  expect(store.read()).toEqual({ enabled: true, context: null, events: [] })
})

it('rejects oversized or unexpected renderer diagnostic payloads', () => {
  expect(debugContextSchema.safeParse(context()).success).toBe(true)
  expect(debugContextSchema.safeParse({ ...context(), partial: 'x'.repeat(8001) }).success).toBe(
    false
  )
  expect(debugContextSchema.safeParse({ ...context(), credentials: 'secret' }).success).toBe(false)
})
