import { useEffect, useState } from 'react'
import type { DebugSnapshot } from '../../../shared/diagnostics'
import './debug.css'

export function DebugWindow(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
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
  return (
    <main className="debug-window">
      <header>
        <div>
          <h1>Conversation debug</h1>
          <p>Live session only · last 150 events · no audio recordings</p>
        </div>
        <button
          onClick={() =>
            void window.diagnostics?.clear().catch(() => setError('Could not clear diagnostics.'))
          }
        >
          Clear debug history
        </button>
      </header>
      <p>
        Capturing while this window is open. Closing it deletes the trace. Expand an event to
        inspect the exact context or result.
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="debug-columns">
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
                <time>{new Date(event.at).toLocaleTimeString()}</time> <strong>{event.kind}</strong>{' '}
                {event.requestId ?? ''}
              </summary>
              <pre>{event.data}</pre>
            </details>
          ))}
        </section>
      </div>
    </main>
  )
}
