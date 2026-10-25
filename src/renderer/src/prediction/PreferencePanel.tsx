import { useEffect, useState } from 'react'
import {
  preferenceFieldsSchema,
  preferenceText,
  type PreferenceFields,
  type PreferenceOperation,
  type PreferenceSnapshot
} from '../../../shared/preferences'
import { useComposition, useCompositionDispatch } from '../composition/state'
import { ActionButton } from '../interaction/controls'

function FactEditor({
  value,
  onChange
}: {
  value: PreferenceFields
  onChange: (value: PreferenceFields) => void
}): React.JSX.Element {
  const { draft } = useComposition()
  const fields = [
    {
      label: 'Relationship',
      value: value.relationship,
      max: 80,
      set: (text: string) => onChange({ ...value, relationship: text })
    },
    {
      label: 'Preference value',
      value: value.value,
      max: 160,
      set: (text: string) => onChange({ ...value, value: text })
    },
    {
      label: 'Game',
      value: value.scope.game ?? '',
      max: 100,
      set: (text: string) => onChange({ ...value, scope: { ...value.scope, game: text || null } })
    },
    {
      label: 'Topic',
      value: value.scope.topic ?? '',
      max: 100,
      set: (text: string) => onChange({ ...value, scope: { ...value.scope, topic: text || null } })
    },
    {
      label: 'Related terms (comma separated)',
      value: value.relatedTerms.join(', '),
      max: 600,
      set: (text: string) =>
        onChange({
          ...value,
          relatedTerms: text
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        })
    }
  ]
  return (
    <div>
      {fields.map((field) => (
        <div key={field.label}>
          <label>
            {field.label}
            <input
              aria-label={field.label}
              maxLength={field.max}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
            />
          </label>
          <ActionButton
            identity={`fact-draft-${field.label}-${draft}-${field.value}`}
            disabled={!draft.trim() || draft.length > field.max}
            onAction={() => field.set(draft)}
          >
            Use draft for {field.label}
          </ActionButton>
          <ActionButton
            identity={`fact-clear-${field.label}-${field.value}`}
            disabled={!field.value}
            onAction={() => field.set('')}
          >
            Clear {field.label}
          </ActionButton>
        </div>
      ))}
    </div>
  )
}

export function PreferencePanel(): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<PreferenceSnapshot | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [view, setView] = useState<'facts' | 'sentences'>('facts')
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<{ id: string; fact: PreferenceFields } | null>(null)
  const dispatch = useCompositionDispatch()
  useEffect(() => {
    let alive = true
    const read = (): void => {
      if (!window.preferences) {
        setError('Restart the desktop app to load preference memory.')
        return
      }
      void window.preferences
        .read()
        .then((value) => {
          if (alive) setSnapshot(value)
        })
        .catch(() => {
          if (alive) setError('Could not read preference memory. Restart or continue composing.')
        })
    }
    read()
    const off = window.preferences?.onChanged(read)
    return () => {
      alive = false
      off?.()
    }
  }, [])
  const update = (operation: PreferenceOperation): void => {
    if (!window.preferences || pending) return
    dispatch({ type: 'memory-changed' })
    setPending(true)
    setError('')
    void window.preferences
      .update(operation)
      .then((value) => {
        setSnapshot(value)
        setEditing(null)
      })
      .catch(() =>
        setError(
          'Could not update preference memory. The record may have changed, conflict with an existing preference, or storage may be full. Review and retry.'
        )
      )
      .finally(() => setPending(false))
  }
  const entries = snapshot ? (view === 'facts' ? snapshot.facts : snapshot.sentences) : []
  const index = Math.min(page, Math.max(0, entries.length - 1))
  const entry = view === 'facts' ? snapshot?.facts[index] : undefined
  const sentence = view === 'sentences' ? snapshot?.sentences[index] : undefined
  const fact = entry && (editing?.id === entry.id ? editing.fact : entry.fact)
  const valid = fact && preferenceFieldsSchema.safeParse(fact).success
  const identity = `preference-${view}-${index}-${entries[index]?.id}-${pending}-${JSON.stringify(fact)}-${snapshot?.busy}`
  return (
    <section aria-label="Preference memory">
      <h3>Preferences and saved sentences</h3>
      <p>
        Confirmed messages are saved on this device when you choose a phrase, lock a sentence, or
        choose Speak. With Gemini enabled, clear personal preferences are learned automatically from
        your messages and relevant recent conversation through OpenRouter. You can edit or forget
        saved facts below. Partner speech and unselected suggestions do not teach your preferences.
      </p>
      <p>
        Moss searches saved facts locally. Preference sharing controls whether relevant saved facts
        go to the suggestion model. Moss usage telemetry and model-loading connectivity apply.
      </p>
      <p role="status">
        {error ||
          snapshot?.error ||
          (snapshot?.busy
            ? 'Processing preference memory…'
            : `${snapshot?.facts.length ?? 0} saved facts`)}
      </p>
      {snapshot && (
        <>
          <p>
            {snapshot.learning
              ? 'Automatic memory learning is on with Gemini.'
              : 'Enable Gemini to learn preferences automatically from confirmed messages.'}
          </p>
          <ActionButton
            identity={`${identity}-retrieve-${snapshot.retrieve}`}
            disabled={pending}
            selected={snapshot.retrieve}
            onAction={() => update({ type: 'settings', retrieve: !snapshot.retrieve })}
          >
            {snapshot.retrieve
              ? 'Stop using preference facts'
              : 'Use saved preference facts in suggestions'}
          </ActionButton>
          <div role="group" aria-label="Preference views">
            {(['facts', 'sentences'] as const).map((tab) => (
              <ActionButton
                key={tab}
                identity={`${identity}-${tab}`}
                selected={view === tab}
                disabled={pending}
                onAction={() => {
                  setView(tab)
                  setPage(0)
                  setEditing(null)
                }}
              >
                {tab === 'facts'
                  ? `Saved facts (${snapshot.facts.length})`
                  : `Saved sentences (${snapshot.sentences.length})`}
              </ActionButton>
            ))}
          </div>
          {!entries.length && <p>No {view} yet.</p>}
          {entries.length > 0 && (
            <>
              <p>
                {index + 1} of {entries.length}
              </p>
              <ActionButton
                identity={`${identity}-previous`}
                disabled={pending || index === 0}
                onAction={() => {
                  setPage(index - 1)
                  setEditing(null)
                }}
              >
                Previous {view}
              </ActionButton>
              <ActionButton
                identity={`${identity}-next`}
                disabled={pending || index === entries.length - 1}
                onAction={() => {
                  setPage(index + 1)
                  setEditing(null)
                }}
              >
                Next {view}
              </ActionButton>
            </>
          )}
          {entry && fact && (
            <>
              <p>{preferenceText(fact)}</p>
              <p>
                Source: {entry.source.text} · Initials: {entry.source.initials}
              </p>
              <p>Evidence: “{entry.quote}”</p>
              <p>
                Context association: {entry.scopeBasis}. {entry.scopeExplanation}
              </p>
              <FactEditor
                value={fact}
                onChange={(value) => setEditing({ id: entry.id, fact: value })}
              />
              {!valid && (
                <p role="alert">
                  Use a relationship and value, at most ten related terms, and keep each field
                  within its length limit.
                </p>
              )}
              <ActionButton
                identity={`${identity}-save`}
                disabled={pending || !valid || !editing}
                onAction={() => update({ type: 'edit', id: entry.id, fact })}
              >
                Save fact changes
              </ActionButton>
              <ActionButton
                identity={`${identity}-forget`}
                disabled={pending}
                onAction={() => update({ type: 'forget', id: entry.id })}
              >
                Forget this fact
              </ActionButton>
            </>
          )}
          {sentence && (
            <>
              <p>{sentence.text}</p>
              <p>Initials: {sentence.initials}</p>
              <ActionButton
                identity={`${identity}-extract-sentence`}
                disabled={pending || !snapshot.learning}
                onAction={() => update({ type: 'extract', id: sentence.id })}
              >
                Retry learning from this sentence
              </ActionButton>
              <ActionButton
                identity={`${identity}-forget-sentence`}
                disabled={pending}
                onAction={() => update({ type: 'forget-sentences', ids: [sentence.id] })}
              >
                Forget this sentence and its facts
              </ActionButton>
            </>
          )}
          <p>
            Forgetting a fact deletes its search vector and cancels pending generation. Its source
            sentence remains until you forget that sentence. Source sentences are not automatically
            reprocessed; explicitly retrying learning can save the preference again. Clear all also
            clears the sentence suggestion cache. Correction-word memory has its own controls above.
          </p>
          <ActionButton
            identity={`${identity}-clear`}
            disabled={pending || (!snapshot.facts.length && !snapshot.sentences.length)}
            onAction={() => update({ type: 'clear' })}
          >
            Forget all preference facts and sentences
          </ActionButton>
        </>
      )}
    </section>
  )
}
