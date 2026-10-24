import { useState } from 'react'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { ActionButton } from '../interaction/controls'
import type { usePredictions } from './usePredictions'

export function ConversationPanel({
  predictions
}: {
  predictions: ReturnType<typeof usePredictions>
}): React.JSX.Element {
  const state = useComposition(),
    dispatch = useCompositionDispatch()
  const [message, setMessage] = useState('')
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
            ? 'Gemini 3 Flash · API key configured'
            : 'Set OPENROUTER_TOKEN in the app .env and restart to connect Gemini.')}
      </p>
      <p>
        Session only · Keeps the eight most recent turns · {state.conversation.length}/8 turns ·
        Clear or edit a turn to cancel suggestions using old context.
      </p>
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
    </div>
  )
}
