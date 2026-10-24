// Behavioral translation of SpeakFaster input-bar, input-bar-chip, abbreviation,
// and abbreviation-refinement (MIT, TeamGleason). See docs/speakfaster-translation.md.
import { useState } from 'react'
import type { DemoScenario } from '../../../../shared/prediction'
import { useComposition, useCompositionDispatch } from '../../composition/state'
import { entryText } from '../../composition/model'
import { ActionButton } from '../../interaction/controls'
import { usePredictions } from '../../prediction/usePredictions'

export function SpeakFasterPanel({ scenario }: { scenario: DemoScenario }): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const { request, waiting } = usePredictions(scenario)
  const [page, setPage] = useState(0)
  const version = `${state.revision}:${state.request?.id ?? ''}:${state.paused}:${state.editor}`
  const keyword = state.editor === 'keywords'
  const phrase = state.phrase
  const spelling = state.mode === 'keyword' || state.mode === 'replacement'
  const tokens = keyword
    ? state.tokens.map((token) => ({
        id: token.id,
        text: token.value,
        start: 0,
        end: 0,
        kind: token.kind
      }))
    : [...(phrase ?? '').matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)].map((word) => ({
        id: `word-${word.index}`,
        text: word[0],
        start: word.index,
        end: word.index + word[0].length,
        kind: 'word'
      }))
  const lastPage = Math.max(0, Math.ceil(tokens.length / 6) - 1)
  const activePage = Math.min(page, lastPage)
  const openKeywords = (): void => {
    setPage(0)
    dispatch({ type: 'open-keywords' })
  }
  const entryLabel = keyword
    ? 'Spell a keyword'
    : phrase !== null
      ? 'Edit phrase'
      : state.mode === 'initials'
        ? 'Initials'
        : 'Exact text'
  const instruction = keyword
    ? state.selectedToken
      ? 'Dasher writes into the highlighted chip. Expand uses it as a word prefix; Lock word keeps the exact word.'
      : 'Choose an initial to spell that word with Dasher.'
    : phrase !== null
      ? state.selection
        ? state.mode === 'replacement'
          ? 'Dasher replaces the highlighted word. Use word keeps your spelling; Cancel word restores it.'
          : 'Choose a same-initial replacement below, or Spell word with Dasher.'
        : 'Choose a word to change. Use phrase accepts this version into your message.'
      : 'Enter with Dasher below. Spell opens the abbreviation as editable chips.'

  return (
    <section className="speakfaster-panel" aria-label="SpeakFaster phrase composition">
      <div className="draft-line">
        <span className="field-label">Message</span>
        <div className="draft-text" aria-label="Accepted draft">
          {state.draft || <span className="placeholder">Your message</span>}
        </div>
        <ActionButton
          identity={`edit-draft-${version}`}
          disabled={!state.draft || phrase !== null}
          onAction={() => {
            setPage(0)
            dispatch({ type: 'edit-draft' })
          }}
        >
          Edit message
        </ActionButton>
      </div>
      <div className="composition-bar" aria-label={entryLabel}>
        <span className="field-label">{entryLabel}</span>
        {state.editor === 'entry' ? (
          <output className="entry-display" aria-label="Dasher text">
            {entryText(state) || (
              <span className="placeholder">
                Click in Dasher or dwell on Start writing, then steer through letters
              </span>
            )}
          </output>
        ) : (
          <div className="word-chips" aria-label="Editable word positions">
            {tokens.slice(activePage * 6, activePage * 6 + 6).map((token, index) => {
              const selected = keyword
                ? state.selectedToken === token.id
                : state.selection?.start === token.start
              const entered = selected && spelling
              return (
                <ActionButton
                  key={token.id}
                  className="word-chip"
                  identity={`chip-${token.id}-${version}`}
                  selected={selected}
                  disabled={state.mode === 'replacement' || !state.paused}
                  onAction={() =>
                    keyword
                      ? dispatch({ type: 'select-token', id: token.id })
                      : dispatch({
                          type: 'select-span',
                          range: { start: token.start, end: token.end }
                        })
                  }
                >
                  <span className="token-position">Word {activePage * 6 + index + 1}</span>{' '}
                  <span className="chip-text">
                    {entered ? state.buffer || token.text : token.text}
                    {!entered && token.kind === 'prefix' ? '…' : ''}
                  </span>{' '}
                  <span className="token-kind">
                    {entered
                      ? 'Dasher writes here'
                      : keyword
                        ? token.kind === 'word'
                          ? 'Locked word'
                          : token.kind === 'prefix'
                            ? 'Prefix'
                            : 'Initial'
                        : selected
                          ? 'Selected'
                          : 'Change word'}
                  </span>
                </ActionButton>
              )
            })}
          </div>
        )}
      </div>
      <div className="phrase-instructions" aria-live="polite">
        {instruction}
      </div>
      {state.paused && (
        <div className="phrase-tools" aria-label="Phrase editing">
          {state.editor !== 'entry' && lastPage > 0 && (
            <>
              <ActionButton
                identity={`previous-words-${version}-${page}`}
                disabled={activePage === 0}
                onAction={() => setPage(activePage - 1)}
              >
                Previous words
              </ActionButton>
              <ActionButton
                identity={`next-words-${version}-${page}`}
                disabled={activePage === lastPage}
                onAction={() => setPage(activePage + 1)}
              >
                Next words
              </ActionButton>
            </>
          )}
          {phrase !== null ? (
            <>
              {state.selection && state.mode !== 'replacement' && (
                <ActionButton
                  identity={`spell-word-${version}`}
                  onAction={() => dispatch({ type: 'spell' })}
                >
                  Spell word
                </ActionButton>
              )}
              {state.mode === 'replacement' && (
                <>
                  <ActionButton
                    identity={`use-word-${version}`}
                    disabled={!state.buffer.trim()}
                    onAction={() => dispatch({ type: 'done' })}
                  >
                    Use word
                  </ActionButton>
                  <ActionButton
                    identity={`cancel-word-${version}`}
                    onAction={() => dispatch({ type: 'cancel-edit' })}
                  >
                    Cancel word
                  </ActionButton>
                </>
              )}
              <ActionButton
                className="primary"
                identity={`use-phrase-${version}`}
                disabled={state.mode === 'replacement'}
                onAction={() => dispatch({ type: 'use-phrase' })}
              >
                Use phrase
              </ActionButton>
              <ActionButton
                identity={`back-${version}`}
                onAction={() => {
                  setPage(0)
                  dispatch({ type: 'back' })
                }}
              >
                Back
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                className="primary"
                identity={`expand-${version}`}
                disabled={state.mode === 'literal' ? !state.draft : !state.tokens.length}
                onAction={() => request(state.mode === 'literal' ? 'completion' : 'expansion')}
              >
                {state.mode === 'literal' ? 'Complete' : 'Expand'}
              </ActionButton>
              {!keyword && (
                <ActionButton
                  identity={`spell-${version}`}
                  disabled={!state.tokens.length}
                  onAction={openKeywords}
                >
                  Spell
                </ActionButton>
              )}
              {state.mode === 'keyword' && (
                <>
                  <ActionButton
                    identity={`lock-${version}`}
                    disabled={!state.buffer.trim()}
                    onAction={() => dispatch({ type: 'done' })}
                  >
                    Lock word
                  </ActionButton>
                  <ActionButton
                    identity={`initial-${version}`}
                    disabled={!/^[A-Za-z]$/.test(state.buffer.trim())}
                    onAction={() => dispatch({ type: 'use-initial' })}
                  >
                    Use initial
                  </ActionButton>
                  <ActionButton
                    identity={`cancel-word-${version}`}
                    onAction={() => dispatch({ type: 'cancel-edit' })}
                  >
                    Cancel word
                  </ActionButton>
                </>
              )}
              {keyword && (
                <ActionButton
                  identity={`continue-${version}`}
                  onAction={() => {
                    dispatch({ type: 'keep-entering' })
                  }}
                >
                  Keep entering
                </ActionButton>
              )}
              {!keyword && !!state.branches.length && (
                <ActionButton
                  identity={`previous-${version}`}
                  onAction={() => dispatch({ type: 'back' })}
                >
                  Previous phrase
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
      {state.paused && (
        <div
          className="choice-area"
          aria-label="Phrase suggestions"
          aria-busy={state.status === 'loading'}
        >
          {state.candidates.length ? (
            <div className="candidate-list">
              {[0, 1, 2, 3].map((index) => {
                const candidate = state.candidates[index]
                return (
                  <div className="candidate-slot" key={candidate?.id ?? `empty-${index}`}>
                    {candidate &&
                      (state.request?.purpose === 'refinement' ? (
                        <ActionButton
                          className="candidate"
                          identity={candidate.id}
                          onAction={() => dispatch({ type: 'accept', id: candidate.id })}
                        >
                          {candidate.replacement}
                        </ActionButton>
                      ) : (
                        <div className="candidate-card">
                          <span className="candidate-text">{candidate.text}</span>
                          <ActionButton
                            identity={`edit-${candidate.id}`}
                            onAction={() => {
                              setPage(0)
                              dispatch({ type: 'edit-candidate', id: candidate.id })
                            }}
                          >
                            Edit {index + 1}
                          </ActionButton>
                          <ActionButton
                            identity={`use-${candidate.id}`}
                            onAction={() => dispatch({ type: 'accept', id: candidate.id })}
                          >
                            Use {index + 1}
                          </ActionButton>
                        </div>
                      ))}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="empty-choices">
              {state.status === 'loading'
                ? 'Finding suggestions…'
                : state.status === 'error' || state.status === 'empty'
                  ? state.notice
                  : phrase !== null
                    ? 'Your edited phrase is a suggestion until you choose Use phrase.'
                    : 'Offline demo suggestions appear here.'}
            </p>
          )}
        </div>
      )}
      <div className="suggestion-footer">
        <p
          role="status"
          className={`status-line ${state.validationError || state.status === 'error' ? 'error' : ''}`}
        >
          {state.validationError ??
            (waiting
              ? 'Move off the dwell target to review suggestions.'
              : phrase !== null
                ? `Editing: ${phrase}`
                : state.notice)}
        </p>
        {state.paused && state.request && (
          <ActionButton
            identity={`dismiss-${version}`}
            onAction={() => {
              if (state.request?.purpose === 'expansion') openKeywords()
              else dispatch({ type: 'dismiss' })
            }}
          >
            {state.status === 'loading' ? 'Cancel' : 'None of these'}
          </ActionButton>
        )}
        {state.paused && (state.status === 'error' || state.status === 'empty') && (
          <ActionButton
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
