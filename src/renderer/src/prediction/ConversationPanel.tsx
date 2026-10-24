import { useState } from 'react'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { ActionButton } from '../interaction/controls'
import type { usePredictions } from './usePredictions'
import { MemoryPanel } from './MemoryPanel'
import type { PhraseModel } from '../../../shared/prediction'

export function ConversationPanel({
  predictions
}: {
  predictions: ReturnType<typeof usePredictions>
}): React.JSX.Element {
  const state = useComposition(),
    dispatch = useCompositionDispatch()
  const [message, setMessage] = useState('')
  const [cacheNotice, setCacheNotice] = useState('')
  const add = (speaker: 'me' | 'partner', text: string): void => {
    dispatch({ type: 'conversation-add', speaker, text })
    setMessage('')
  }
  return (
    <div className="conversation-panel">
      <p>
        Gemini uses your current message constraints and the conversation listed here to suggest six
        replies. These are sent through OpenRouter. Nothing is spoken or accepted automatically.
      </p>
      <p>
        Locked sentences and their initials are saved on this device immediately, before speech,
        including corrections. With Gemini enabled, conversation context guides suggestions,
        including tense and topic. Saved phrases appear directly when there is no conversation
        context or cloud generation is off. Exact matches rank ahead of one-letter differences in
        initials of four or more letters. When Gemini is enabled, matching saved phrases are
        included in the request to avoid duplicates.
      </p>
      <ActionButton
        identity="clear-phrase-cache"
        onAction={() => {
          dispatch({ type: 'dismiss' })
          if (!window.gemini) {
            setCacheNotice('Open the desktop app to clear saved phrases.')
            return
          }
          void window.gemini
            .clearPhraseCache()
            .then(() => setCacheNotice('Saved phrases cleared.'))
            .catch(() =>
              setCacheNotice('Could not clear saved phrases. Check local storage and retry.')
            )
        }}
      >
        Clear saved phrases
      </ActionButton>
      {cacheNotice && <p role="status">{cacheNotice}</p>}
      <PhraseModelPicker predictions={predictions} />
      <ActionButton
        identity={`cloud-${state.cloudEnabled}`}
        selected={state.cloudEnabled}
        onAction={() => {
          void predictions.setEnabled(!state.cloudEnabled)
        }}
      >
        {state.cloudEnabled ? 'Disable Gemini' : 'Enable Gemini'}
      </ActionButton>
      <p role="status">
        {predictions.connectionError ||
          (predictions.connection?.configured
            ? `${predictions.connection.model} · API key configured`
            : 'Set OPENROUTER_TOKEN in the app .env and restart to connect Gemini.')}
      </p>
      <p>
        Session only · Locked sentences and spoken messages stay here as you compose your next
        reply. Keeps eight recent turns plus a temporary summary of earlier dialogue ·{' '}
        {state.conversation.length}/8 turns · Clear or edit a turn to cancel suggestions using old
        context.
      </p>
      <p>
        With Gemini enabled, older turns are summarized through OpenRouter. The summary is
        session-only, helps with follow-ups, and is not saved as a preference. Clear conversation
        removes both.
      </p>
      <p aria-label="Conversation summary">
        {state.conversationSummary || 'No earlier conversation summarized yet.'}
      </p>
      {!!state.summaryPending.length && (
        <p>{state.summaryPending.length} earlier turns waiting for summary.</p>
      )}
      {state.summaryError && <p role="status">{state.summaryError}</p>}
      {!!state.summaryPending.length && (
        <ActionButton
          identity="retry-conversation-summary"
          onAction={() => dispatch({ type: 'summary-retry' })}
        >
          Retry summary
        </ActionButton>
      )}
      {(state.conversationSummary || state.summaryPending.length > 0) && (
        <ActionButton
          identity="forget-conversation-summary"
          onAction={() => dispatch({ type: 'summary-reset' })}
        >
          Forget earlier context
        </ActionButton>
      )}
      <ol className="conversation-turns">
        {state.conversation.map((turn, index) => (
          <li key={turn.id}>
            <label>
              {turn.speaker === 'me' ? 'Me' : 'Partner'} · Turn {index + 1}
              <textarea
                aria-label={`Conversation turn ${index + 1}`}
                value={turn.text}
                maxLength={1000}
                onChange={(event) =>
                  dispatch({ type: 'conversation-edit', id: turn.id, text: event.target.value })
                }
              />
            </label>
            <ActionButton
              identity={`remove-${turn.id}`}
              onAction={() => dispatch({ type: 'conversation-remove', id: turn.id })}
            >
              Remove turn {index + 1}
            </ActionButton>
          </li>
        ))}
      </ol>
      <label>
        Partner message
        <textarea
          aria-label="Partner message"
          value={message}
          maxLength={1000}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Type or paste what your conversation partner said"
        />
      </label>
      <ActionButton
        identity={`add-partner-${state.revision}`}
        disabled={!message.trim()}
        onAction={() => add('partner', message)}
      >
        Add partner message
      </ActionButton>
      <div className="conversation-actions">
        <ActionButton
          identity={`add-my-draft-${state.revision}`}
          disabled={!state.draft.trim()}
          onAction={() => add('me', state.draft)}
        >
          Add my accepted message
        </ActionButton>
        <ActionButton
          identity={`add-partner-draft-${state.revision}`}
          disabled={!state.draft.trim()}
          onAction={() => add('partner', state.draft)}
        >
          Add draft as partner message
        </ActionButton>
        <ActionButton
          identity={`clear-conversation-${state.revision}`}
          disabled={!state.conversation.length}
          onAction={() => dispatch({ type: 'conversation-clear' })}
        >
          Clear conversation
        </ActionButton>
      </div>
      <p>
        For gaze entry, compose a message with Dasher first, then add the accepted message above.
        New message keeps this conversation; Clear conversation forgets it.
      </p>
      {state.validationError && <p role="alert">{state.validationError}</p>}
      <MemoryPanel />
    </div>
  )
}

function PhraseModelPicker({
  predictions
}: {
  predictions: ReturnType<typeof usePredictions>
}): React.JSX.Element {
  const [models, setModels] = useState<PhraseModel[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const filtered = models.filter((model) =>
    `${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase())
  )
  const pages = Math.max(1, Math.ceil(filtered.length / 6))
  const currentPage = Math.min(page, pages - 1)
  const load = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      if (!window.gemini) throw Error('Desktop bridge unavailable')
      const available = await window.gemini.models()
      setModels(available)
      if (!available.length) setError('No text models are available. Try loading models again.')
    } catch {
      setError('Could not load OpenRouter models. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <section aria-label="Phrase model">
      <p>Phrase model: {predictions.connection?.model ?? 'Loading saved selection…'}</p>
      <p>
        Choose an OpenRouter model for phrase suggestions. Model pricing and response speed vary.
        Conversation summaries and memory processing use their existing model.
      </p>
      <ActionButton
        identity={`phrase-model-picker-${open}`}
        disabled={loading || saving}
        onAction={() => {
          setOpen(!open)
          if (!open && !models.length) void load()
        }}
      >
        {loading ? 'Loading models…' : open ? 'Close model picker' : 'Choose phrase model'}
      </ActionButton>
      {open && (
        <>
          <label>
            Find a model
            <input
              aria-label="Find a model"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
            />
          </label>
          <div role="group" aria-label="Available phrase models">
            {filtered.slice(currentPage * 6, currentPage * 6 + 6).map((model) => (
              <ActionButton
                key={model.id}
                identity={`phrase-model-${model.id}`}
                selected={model.id === predictions.connection?.model}
                disabled={saving || !predictions.connection}
                onAction={() => {
                  setSaving(true)
                  void predictions.setModel(model.id).finally(() => setSaving(false))
                }}
              >
                {model.name} ({model.id})
              </ActionButton>
            ))}
          </div>
          {!loading && !filtered.length && !error && <p>No models match your search.</p>}
          <p role="status">
            {saving ? 'Saving model…' : `Model page ${currentPage + 1} of ${pages}`}
          </p>
          <ActionButton
            identity={`previous-models-${currentPage}-${search}`}
            disabled={saving || currentPage === 0}
            onAction={() => setPage(currentPage - 1)}
          >
            Previous models
          </ActionButton>
          <ActionButton
            identity={`next-models-${currentPage}-${search}`}
            disabled={saving || currentPage + 1 >= pages}
            onAction={() => setPage(currentPage + 1)}
          >
            Next models
          </ActionButton>
          {error && (
            <>
              <p role="alert">{error}</p>
              <ActionButton
                identity="reload-models"
                disabled={loading || saving}
                onAction={() => {
                  void load()
                }}
              >
                Reload models
              </ActionButton>
            </>
          )}
        </>
      )}
    </section>
  )
}
