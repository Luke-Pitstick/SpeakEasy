import { useEffect, useState } from 'react'
import {
  rememberedWords,
  memoryVocabulary,
  memoryExampleAllowed,
  type MemorySnapshot,
  type MemoryOperation
} from '../../../shared/memory'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { ActionButton } from '../interaction/controls'
import { PreferencePanel } from './PreferencePanel'

export function MemoryPanel(): React.JSX.Element {
  const composition = useComposition()
  const dispatch = useCompositionDispatch()
  const [snapshot, setSnapshot] = useState<MemorySnapshot | null>(null)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [pending, setPending] = useState(false)
  const [view, setView] = useState<'vocabulary' | 'corrections'>('vocabulary')
  const [filter, setFilter] = useState('')
  const [wordPage, setWordPage] = useState(0)
  useEffect(() => {
    let alive = true
    const refresh = (): void => {
      if (!window.memory) {
        setError('Memory is available in the desktop app.')
        return
      }
      void window.memory
        .read()
        .then((value) => {
          if (alive) setSnapshot(value)
        })
        .catch(() => {
          if (alive) setError('Could not load memory. Restart or continue without personalization.')
        })
    }
    refresh()
    const unsubscribe = window.memory?.onChanged(refresh)
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])
  const update = (operation: MemoryOperation): void => {
    if (!window.memory || pending) return
    dispatch({ type: 'memory-changed' })
    setPending(true)
    setError('')
    void window.memory
      .update(operation)
      .then(setSnapshot)
      .catch(() => setError('Could not update memory. Please retry.'))
      .finally(() => setPending(false))
  }
  const index = Math.min(page, Math.max(0, (snapshot?.records.length ?? 1) - 1))
  const record = snapshot?.records[index]
  const vocabulary = snapshot ? memoryVocabulary(snapshot.records, snapshot.forgottenWords) : []
  const filtered = vocabulary.filter(({ key }) =>
    key.includes(filter.normalize('NFKC').toLowerCase().trim())
  )
  const currentWordPage = Math.min(wordPage, Math.max(0, Math.ceil(filtered.length / 12) - 1))
  const identity = `memory-${snapshot?.revision}-${record?.id}-${composition.revision}-${pending}-${view}-${currentWordPage}-${filter}`
  return (
    <section aria-label="Personal memory">
      <h3>Personal memory</h3>
      <p>
        Learn exact words and expansions when you commit a correction with Use phrase or Use word.
        Previews, rejected suggestions, and partner speech are never saved as memories. Undo
        retracts the learned correction.
      </p>
      <p>
        Saved on this device until you forget them, up to 2,000 corrections. Cloud use sends only
        relevant vocabulary and examples to Gemini through OpenRouter. The local database is not
        encrypted by the app; there is no app-managed backup or sync.
      </p>
      <p role="status">
        {error ||
          snapshot?.error ||
          composition.memoryNotice ||
          `${snapshot?.records.length ?? 0} saved corrections`}
      </p>
      {snapshot && (
        <>
          <ActionButton
            identity={`${identity}-learning`}
            disabled={pending}
            selected={snapshot.learning}
            onAction={() =>
              update({ type: 'settings', learning: !snapshot.learning, cloud: snapshot.cloud })
            }
          >
            {snapshot.learning ? 'Stop learning corrections' : 'Learn my corrections'}
          </ActionButton>
          <ActionButton
            identity={`${identity}-cloud`}
            disabled={pending}
            selected={snapshot.cloud}
            onAction={() =>
              update({ type: 'settings', learning: snapshot.learning, cloud: !snapshot.cloud })
            }
          >
            {snapshot.cloud ? 'Stop using memory in Gemini' : 'Use memory in Gemini'}
          </ActionButton>
          <div role="group" aria-label="Memory views">
            <ActionButton
              identity={`${identity}-vocabulary`}
              selected={view === 'vocabulary'}
              disabled={pending}
              onAction={() => setView('vocabulary')}
            >
              Vocabulary ({vocabulary.length})
            </ActionButton>
            <ActionButton
              identity={`${identity}-corrections`}
              selected={view === 'corrections'}
              disabled={pending}
              onAction={() => setView('corrections')}
            >
              Corrections ({snapshot.records.length})
            </ActionButton>
          </div>
          {view === 'vocabulary' && (
            <>
              <p>
                Forget a word to stop using it and saved examples containing it in personal memory
                context. Other learned words stay available. Correction history is kept for review;
                a new explicit correction can teach the word again.
              </p>
              <p>
                Your draft, session conversation, and spoken-phrase cache are separate. Use Clear
                saved phrases above to clear that cache.
              </p>
              <label>
                Find a learned word
                <input
                  aria-label="Find a learned word"
                  value={filter}
                  onChange={(event) => {
                    setFilter(event.target.value)
                    setWordPage(0)
                  }}
                />
              </label>
              <ActionButton
                identity={`${identity}-clear-filter`}
                disabled={pending || !filter}
                onAction={() => {
                  setFilter('')
                  setWordPage(0)
                }}
              >
                Clear word filter
              </ActionButton>
              {filtered.length ? (
                <>
                  <p>
                    Words {currentWordPage * 12 + 1}–
                    {Math.min((currentWordPage + 1) * 12, filtered.length)} of {filtered.length}
                  </p>
                  <table aria-label="Learned vocabulary">
                    <thead>
                      <tr>
                        <th scope="col">Word</th>
                        <th scope="col">Confirmed corrections</th>
                        <th scope="col">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice(currentWordPage * 12, (currentWordPage + 1) * 12)
                        .map((entry) => (
                          <tr key={entry.key}>
                            <th scope="row">{entry.word}</th>
                            <td>{entry.corrections}</td>
                            <td>
                              <ActionButton
                                identity={`${identity}-forget-word-${entry.key}`}
                                disabled={pending}
                                onAction={() => update({ type: 'forget-word', word: entry.word })}
                              >
                                Forget {entry.word}
                              </ActionButton>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  <ActionButton
                    identity={`${identity}-words-previous`}
                    disabled={pending || currentWordPage === 0}
                    onAction={() => setWordPage(currentWordPage - 1)}
                  >
                    Previous words
                  </ActionButton>
                  <ActionButton
                    identity={`${identity}-words-next`}
                    disabled={pending || (currentWordPage + 1) * 12 >= filtered.length}
                    onAction={() => setWordPage(currentWordPage + 1)}
                  >
                    Next words
                  </ActionButton>
                </>
              ) : (
                <p>{filter ? 'No learned words match your filter.' : 'No learned words yet.'}</p>
              )}
            </>
          )}
          {view === 'corrections' && record && (
            <>
              <p>
                Correction {index + 1} of {snapshot.records.length}
              </p>
              <p>Original: {record.before}</p>
              <p>Accepted: {record.after}</p>
              <p>
                Learned words:{' '}
                {rememberedWords(record, snapshot.forgottenWords).join(', ') || 'None'}
              </p>
              {!memoryExampleAllowed(record, snapshot.forgottenWords) && (
                <p>
                  This example is excluded from personal memory context because it contains a
                  forgotten word.
                </p>
              )}
              <ActionButton
                identity={`${identity}-previous`}
                disabled={pending || index === 0}
                onAction={() => setPage(index - 1)}
              >
                Previous memory
              </ActionButton>
              <ActionButton
                identity={`${identity}-next`}
                disabled={pending || index === snapshot.records.length - 1}
                onAction={() => setPage(index + 1)}
              >
                Next memory
              </ActionButton>
              <ActionButton
                identity={`${identity}-forget`}
                disabled={pending}
                onAction={() => update({ type: 'forget', ids: [record.id] })}
              >
                Forget this correction
              </ActionButton>
              <ActionButton
                identity={`${identity}-edit`}
                disabled={
                  pending ||
                  !composition.draft.trim() ||
                  composition.draft === record.after ||
                  composition.draft.length > 500
                }
                onAction={() => update({ type: 'edit', id: record.id, text: composition.draft })}
              >
                Replace with my accepted message
              </ActionButton>
              <p>
                To edit with your eyes, compose the corrected message in Dasher, then replace this
                memory. Forget removes this example and its derived words; other saved corrections
                may contain the same words. Session conversation, your current draft, and the
                spoken-phrase cache remain separate; use Clear saved phrases above to clear that
                cache.
              </p>
            </>
          )}
          <ActionButton
            identity={`${identity}-clear`}
            disabled={pending || (!snapshot.records.length && !snapshot.forgottenWords.length)}
            onAction={() => update({ type: 'clear' })}
          >
            Forget all corrections
          </ActionButton>
        </>
      )}
      <PreferencePanel />
    </section>
  )
}
