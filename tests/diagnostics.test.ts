// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

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
  retainedTurnCount: 0,
  partial: '',
  queuedTranscripts: [],
  listening: 'Listening',
  paused: true,
  busy: false
})

it('captures only while debug mode is on, bounds history, and deletes traces when turned off', () => {
  const store = new DiagnosticStore()
  store.record('transcript', { text: 'private' })
  store.context(context())
  expect(store.read()).toEqual({
    enabled: false,
    context: null,
    events: [],
    transcripts: [],
    generations: []
  })
  store.setEnabled(true)
  store.context(context())
  for (let i = 0; i < 180; i++) store.record('candidate', { i }, 'request-1')
  expect(store.read().events).toHaveLength(150)
  const snapshot = store.read()
  snapshot.context!.conversation[0].text = 'mutated'
  expect(store.read().context?.conversation[0].text).not.toBe('mutated')
  store.setEnabled(false)
  expect(store.read()).toEqual({
    enabled: false,
    context: null,
    events: [],
    transcripts: [],
    generations: []
  })
})

it('clears previous private context after conversation reset and supports explicit deletion', () => {
  const store = new DiagnosticStore()
  store.setEnabled(true)
  store.context(context())
  store.record('memory', { facts: ['private fact'] })
  store.context({ ...context(), epoch: 1, conversation: [] })
  expect(JSON.stringify(store.read())).not.toContain('private fact')
  expect(store.read().events).toHaveLength(1)
  store.clear()
  expect(store.read()).toEqual({
    enabled: true,
    context: null,
    events: [],
    transcripts: [],
    generations: []
  })
})

it('logs transcripts and assembles expansion traces only while pending', () => {
  const store = new DiagnosticStore()
  store.transcript({ session: 's', id: 's-0', text: 'hidden' })
  store.setEnabled(true)
  store.transcript({ session: 's', id: 's-1', text: 'How was school?' })
  const trace = {
    requestId: 'r1',
    acronym: 'i w g',
    model: 'google/gemini-3.8-flash',
    status: 'pending' as const,
    cached: [],
    shortTerm: null,
    longTerm: null,
    reasoning: { context: null, model: '' },
    candidates: []
  }
  store.generation(trace)
  store.appendReasoning('r1', 'Partner asked ')
  store.appendReasoning('r1', 'about school.')
  store.updateGeneration('r1', { status: 'complete', candidates: ['It was good'] })
  store.updateGeneration('r1', { status: 'cancelled' })
  store.updateGeneration('unknown', { status: 'error' })
  const snapshot = store.read()
  expect(snapshot.transcripts.map((t) => t.text)).toEqual(['How was school?'])
  expect(snapshot.generations).toHaveLength(1)
  expect(snapshot.generations[0]).toMatchObject({
    status: 'complete',
    candidates: ['It was good'],
    reasoning: { model: 'Partner asked about school.' }
  })
  for (let i = 0; i < 60; i++) store.generation({ ...trace, requestId: `r${i + 2}` })
  expect(store.read().generations).toHaveLength(50)
  store.clear()
  expect(store.read().transcripts).toEqual([])
  expect(store.read().generations).toEqual([])
})

it('rejects oversized or unexpected renderer diagnostic payloads', () => {
  expect(debugContextSchema.safeParse(context()).success).toBe(true)
  expect(debugContextSchema.safeParse({ ...context(), partial: 'x'.repeat(8001) }).success).toBe(
    false
  )
  expect(debugContextSchema.safeParse({ ...context(), credentials: 'secret' }).success).toBe(false)
})
