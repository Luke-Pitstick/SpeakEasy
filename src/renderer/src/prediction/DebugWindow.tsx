// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

import { useEffect, useState } from 'react'
import type { DebugSnapshot, GenerationTrace } from '../../../shared/diagnostics'
import { preferenceText } from '../../../shared/preferences'
import './debug.css'

const time = (at: number): string => new Date(at).toLocaleTimeString()

function GenerationEntry({
  trace,
  open
}: {
  trace: GenerationTrace
  open: boolean
}): React.JSX.Element {
  const { shortTerm, longTerm, reasoning } = trace
  return (
    <details className="generation" open={open}>
      <summary>
        <time>{time(trace.at)}</time> <code className="acronym">{trace.acronym || '—'}</code>{' '}
        <span className={`status status-${trace.status}`}>{trace.status}</span>{' '}
        {trace.candidates.length} suggestion{trace.candidates.length === 1 ? '' : 's'}
      </summary>
      <p className="meta">
        {trace.model} · {trace.requestId}
      </p>
      {trace.message && <p className="meta">{trace.message}</p>}
      <h4>Short-term memory · conversation context</h4>
      {!shortTerm ? (
        <p className="muted">
          {trace.status === 'pending' ? 'Waiting for context retrieval…' : 'No context was sent.'}
        </p>
      ) : (
        <>
          {shortTerm.conversation.length ? (
            <ol>
              {shortTerm.conversation.map((turn, i) => (
                <li key={i}>
                  <strong>{turn.speaker === 'me' ? 'User' : 'Partner'}:</strong> {turn.text}
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">No conversation turns included.</p>
          )}
          {shortTerm.lockedMessage && (
            <p>
              <strong>Unsent preceding sentences:</strong> {shortTerm.lockedMessage}
            </p>
          )}
          {shortTerm.draft && (
            <p>
              <strong>Draft:</strong> {shortTerm.draft}
            </p>
          )}
        </>
      )}
      <h4>Long-term memory · database and Moss</h4>
      {!longTerm ? (
        <p className="muted">
          {trace.status === 'pending' ? 'Waiting for memory retrieval…' : 'No memory was sent.'}
        </p>
      ) : (
        <>
          <p>
            <strong>Moss query:</strong> {longTerm.query || 'None'}
            {longTerm.cacheHit ? ' (cached decision)' : ''}
          </p>
          <p>
            <strong>Personal facts (Moss):</strong>
          </p>
          {longTerm.facts.length ? (
            <ul>
              {longTerm.facts.map((fact, i) => (
                <li key={i}>{preferenceText(fact)}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None included.</p>
          )}
          <p>
            <strong>Corrected vocabulary (database):</strong>{' '}
            {longTerm.vocabulary.join(', ') || 'None'}
          </p>
          <p>
            <strong>Saved examples (database):</strong>
          </p>
          {longTerm.examples.length ? (
            <ul>
              {longTerm.examples.map((example, i) => (
                <li key={i}>
                  <code>{example.initials}</code> → {example.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">None included.</p>
          )}
        </>
      )}
      <h4>Reasoning</h4>
      {reasoning.context ? (
        <p>
          <strong>Context resolver:</strong> topic “{reasoning.context.topic || 'none'}”,{' '}
          {reasoning.context.timeFrame} time frame, intent “
          {reasoning.context.replyIntent || 'none'}”
          {reasoning.context.certain ? '' : ' (uncertain — latest turn only)'}
          {reasoning.context.vocabulary.length
            ? `. Vocabulary: ${reasoning.context.vocabulary.join(', ')}`
            : ''}
        </p>
      ) : (
        <p className="muted">No context resolver decision.</p>
      )}
      {reasoning.model ? (
        <pre>{reasoning.model}</pre>
      ) : (
        <p className="muted">The generation model returned no reasoning text.</p>
      )}
      <h4>Suggestions</h4>
      {trace.cached.length > 0 && (
        <p>
          <strong>From phrase cache:</strong> {trace.cached.join(' / ')}
        </p>
      )}
      {trace.candidates.length ? (
        <ol>
          {trace.candidates.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ol>
      ) : (
        <p className="muted">None yet.</p>
      )}
    </details>
  )
}

export function DebugWindow(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const close = (): void =>
    void window.diagnostics?.close().catch(() => setError('Could not close the debug window.'))
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setTimeout>
    const read = async (): Promise<void> => {
      try {
        const value = await window.diagnostics!.read()
        if (alive) {
          setSnapshot(value)
          setError('')
        }
      } catch {
        if (alive) setError('Could not read diagnostics. Close and reopen this window.')
      }
      if (alive) timer = setTimeout(() => void read(), 500)
    }
    void read()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])
  const current = snapshot?.context
  const events = snapshot?.events.filter((event) => filter === 'all' || event.kind === filter) ?? []
  const transcripts = snapshot?.transcripts ?? []
  const generations = snapshot?.generations ?? []
  return (
    <main className="debug-window">
      <header>
        <div>
          <h1>Conversation debug</h1>
          <p>Live session only · last 150 events · no audio recordings</p>
        </div>
        <div className="debug-actions">
          <button className="debug-back" onClick={close}>
            ← Back to SpeakEasy
          </button>
          <button
            onClick={() =>
              void window.diagnostics?.clear().catch(() => setError('Could not clear diagnostics.'))
            }
          >
            Clear debug history
          </button>
        </div>
      </header>
      <p>
        {snapshot && !snapshot.enabled
          ? 'Debug mode is off, so nothing is being captured. Turn it on in SpeakEasy settings.'
          : 'Capturing while debug mode is on, even when this window is closed. Turning debug mode off deletes the trace. Expand an event to inspect the exact context or result.'}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="debug-columns">
        <div className="debug-stack">
          <section>
            <h2>Active context</h2>
            <p>
              <strong>Microphone:</strong> {current?.listening ?? 'Waiting for context'}
            </p>
            <p>
              <strong>Partial transcript:</strong> {current?.partial || 'None'}
            </p>
            <p>
              <strong>Queued finalized transcripts:</strong>{' '}
              {current?.queuedTranscripts.map((t) => t.text).join(' / ') || 'None'}
            </p>
            <p>
              <strong>Interaction:</strong>{' '}
              {current?.busy
                ? 'Dwell active — context queued'
                : current?.paused
                  ? 'Paused — context can apply'
                  : 'Writing — context queued'}
            </p>
            <p>
              <strong>Initials:</strong> {current?.initials || 'None'}
            </p>
            <p>
              <strong>Unsent preceding sentences:</strong> {current?.lockedMessage || 'None'}
            </p>
            <p>
              <strong>Current draft:</strong> {current?.draft || 'Empty'}
            </p>
            <h3>Recent conversation</h3>
            <ol>
              {current?.conversation.map((turn, i) => (
                <li key={i}>
                  <strong>{turn.speaker === 'me' ? 'User' : 'Partner'}:</strong> {turn.text}
                </li>
              ))}
            </ol>
            <p>Retained session turns: {current?.retainedTurnCount ?? 0}/500</p>
          </section>
          <section>
            <h2>Speech-to-text log</h2>
            {!transcripts.length && <p>No finalized transcripts yet.</p>}
            <ol className="transcripts">
              {[...transcripts].reverse().map((entry) => (
                <li key={entry.id}>
                  <time>{time(entry.at)}</time> {entry.text}
                </li>
              ))}
            </ol>
          </section>
        </div>
        <div className="debug-stack">
          <section>
            <h2>Acronym expansions</h2>
            <p>
              Each initials expansion with the context it was given, its reasoning, and its
              suggestions. Newest first.
            </p>
            {!generations.length && <p>No expansions captured yet.</p>}
            {[...generations].reverse().map((trace, i) => (
              <GenerationEntry key={trace.requestId} trace={trace} open={i === 0} />
            ))}
          </section>
          <section>
            <h2>Request and context history</h2>
            <label>
              Show{' '}
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                {[
                  'all',
                  'topic',
                  'context',
                  'transcript',
                  'listening',
                  'request',
                  'retrieval',
                  'memory',
                  'candidate',
                  'result',
                  'cancel'
                ].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <p>
              Requests show exactly what generation received. Retrieval shows the topic query, cache
              use, and matching facts. Candidates show accepted and rejected model lines.
            </p>
            {!events.length && <p>No events captured yet.</p>}
            {[...events].reverse().map((event) => (
              <details key={event.sequence}>
                <summary>
                  <time>{new Date(event.at).toLocaleTimeString()}</time>{' '}
                  <strong>{event.kind}</strong> {event.requestId ?? ''}
                </summary>
                <pre>{event.data}</pre>
              </details>
            ))}
          </section>
        </div>
      </div>
    </main>
  )
}
