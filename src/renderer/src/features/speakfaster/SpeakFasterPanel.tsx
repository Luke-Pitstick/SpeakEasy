// React translation of SpeakFaster's abbreviation, selection and word refinement
// flows. MIT, TeamGleason. See docs/source-manifest.md for the source mapping.
import type { DemoScenario } from '../../../../shared/prediction'
import { useComposition, useCompositionDispatch } from '../../composition/state'
import { entrySeed } from '../../composition/model'
import { ActionButton } from '../../interaction/controls'
import { usePredictions } from '../../prediction/usePredictions'

export function SpeakFasterPanel({
  scenario,
  editInitials,
  closeInitials
}: {
  scenario: DemoScenario
  editInitials: boolean
  closeInitials: () => void
}): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const { request, waiting } = usePredictions(scenario)
  const editing = state.mode === 'keyword' || state.mode === 'replacement'
  const version = `${state.revision}:${state.request?.id ?? ''}:${state.paused}`
  const correction = !!state.selection && !state.request && !editing
  const words = [...state.draft.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)]
  let previousEnd = 0
  const draftWords = words.map((word) => {
    const start = word.index
    const prefix = state.draft.slice(previousEnd, start)
    previousEnd = start + word[0].length
    return (
      <span key={`${start}:${word[0]}`}>
        {prefix}
        <ActionButton
          className="word-button"
          identity={`word-${start}-${version}`}
          selected={state.selection?.start === start}
          disabled={editing}
          onAction={() =>
            dispatch({ type: 'select-span', range: { start, end: start + word[0].length } })
          }
        >
          {word[0]}
        </ActionButton>
      </span>
    )
  })
  const primary = (): void => {
    if (editing) {
      dispatch({ type: 'done' })
      closeInitials()
    } else if (correction) dispatch({ type: 'cancel-edit' })
    else if (editInitials) closeInitials()
    else if (state.status === 'loading') dispatch({ type: 'dismiss' })
    else request(state.mode === 'initials' ? 'expansion' : 'completion')
  }
  return (
    <section
      className="speakfaster-panel"
      aria-label="SpeakFaster phrase composition"
      onPointerEnter={() => {
        if (!state.paused)
          dispatch({ type: 'pause', notice: 'Paused while you review your words.' })
      }}
    >
      <div className="draft-line">
        <span className="field-label">Message</span>
        <div className="draft-text" aria-label="Accepted draft">
          {state.draft ? (
            <>
              {draftWords}
              {state.draft.slice(previousEnd)}
            </>
          ) : (
            <span className="placeholder">Your message</span>
          )}
        </div>
      </div>
      <div className="entry-row">
        <div className="entry-field">
          <label className="field-label" htmlFor="entry-input">
            {state.mode === 'initials'
              ? 'Initials'
              : state.mode === 'keyword'
                ? 'Spell word'
                : state.mode === 'replacement'
                  ? 'Replace word'
                  : 'Exact text'}
          </label>
          <input
            id="entry-input"
            value={entrySeed(state)}
            placeholder={
              state.mode === 'initials' ? 'Enter the first letter of each word' : 'Spell your words'
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={state.mode === 'initials' ? 24 : 500}
            onFocus={() => dispatch({ type: 'pause' })}
            onChange={(event) => dispatch({ type: 'input', text: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') primary()
            }}
          />
        </div>
        <ActionButton
          className="primary entry-action"
          identity={`expand-${version}`}
          disabled={
            !editing &&
            !correction &&
            !editInitials &&
            state.status !== 'loading' &&
            (state.mode === 'initials' ? !state.tokens.length : !state.draft)
          }
          onAction={primary}
        >
          {editing
            ? 'Use word'
            : correction
              ? 'Keep word'
              : editInitials
                ? 'Done'
                : state.status === 'loading'
                  ? 'Cancel'
                  : state.mode === 'initials'
                    ? 'Expand'
                    : 'Complete'}
        </ActionButton>
      </div>
      <div
        className="choice-area"
        aria-label="Phrase suggestions"
        aria-busy={state.status === 'loading'}
      >
        {editing ? (
          <div className="context-actions">
            <p>Spell exactly with Dasher below.</p>
            {state.mode === 'keyword' && (
              <ActionButton
                identity={`use-initial-${version}`}
                onAction={() => {
                  dispatch({ type: 'use-initial' })
                  closeInitials()
                }}
              >
                Use as initial
              </ActionButton>
            )}
            <ActionButton
              identity={`cancel-edit-${version}`}
              onAction={() => dispatch({ type: 'cancel-edit' })}
            >
              Cancel correction
            </ActionButton>
          </div>
        ) : correction ? (
          <div className="context-actions">
            <p>Change “{state.draft.slice(state.selection!.start, state.selection!.end)}”</p>
            <ActionButton
              identity={`spell-${version}`}
              onAction={() => dispatch({ type: 'spell' })}
            >
              Spell a replacement
            </ActionButton>
            <ActionButton identity={`refine-${version}`} onAction={() => request('refinement')}>
              Suggest a replacement
            </ActionButton>
          </div>
        ) : editInitials ? (
          <div className="initial-editor">
            <p>Select an initial to spell the full word.</p>
            <div className="token-row">
              {state.tokens.map((token) => (
                <ActionButton
                  key={token.id}
                  className="token-chip"
                  identity={`token-${token.id}-${version}`}
                  selected={state.selectedToken === token.id}
                  onAction={() => {
                    dispatch({ type: 'select-token', id: token.id })
                    dispatch({ type: 'spell' })
                  }}
                >
                  {token.value}
                </ActionButton>
              ))}
            </div>
          </div>
        ) : state.candidates.length ? (
          <div className="candidate-list">
            {[0, 1, 2, 3].map((index) => {
              const candidate = state.candidates[index]
              return (
                <div className="candidate-slot" key={candidate?.id ?? `empty-${index}`}>
                  {candidate && (
                    <ActionButton
                      className="candidate"
                      identity={candidate.id}
                      onAction={() => dispatch({ type: 'accept', id: candidate.id })}
                    >
                      {candidate.text}
                    </ActionButton>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="empty-choices">
            <p>
              {state.status === 'loading'
                ? 'Finding phrases…'
                : state.status === 'error'
                  ? 'Suggestions unavailable'
                  : state.status === 'empty'
                    ? 'No matching demo phrases'
                    : state.draft
                      ? 'Select a word above to change it.'
                      : 'Enter initials, then choose a phrase.'}
            </p>
          </div>
        )}
      </div>
      <div className="suggestion-footer">
        <p
          role="status"
          className={`status-line ${state.status === 'error' || state.validationError ? 'error' : ''}`}
        >
          {state.validationError ??
            (waiting
              ? 'Move off the current dwell target to review suggestions.'
              : state.status === 'error' || state.status === 'empty'
                ? state.notice
                : state.tokens.some((token) => token.kind === 'word')
                  ? `Locked: ${state.tokens
                      .filter((token) => token.kind === 'word')
                      .map((token) => token.value)
                      .join(', ')}`
                  : '')}
        </p>
        {state.request && state.status !== 'loading' && (
          <ActionButton
            className="reject-action"
            identity={`reject-${version}`}
            onAction={() => {
              dispatch({ type: 'dismiss' })
              dispatch({ type: 'mode', mode: 'initials' })
            }}
          >
            None of these
          </ActionButton>
        )}
        {(state.status === 'error' || state.status === 'empty') && (
          <ActionButton
            className="reject-action"
            identity={`retry-${version}`}
            onAction={() => request(state.request?.purpose ?? 'expansion')}
          >
            Retry
          </ActionButton>
        )}
      </div>
    </section>
  )
}
