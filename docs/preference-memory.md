# Preference memory and sentence commits

Moss is the sole conversation-context and preference-retrieval strategy. SQLite stores committed sentences and saved facts; disposable local Moss sessions search them. The user selected this implementation on October 24, 2026 after testing the combined implementation. Exact correction lookup and saved-phrase matching retain their separate roles.

## Automatic saving

Use phrase, accepted expansion/refinement, accepted draft replacement, Lock sentence, and explicit Speak confirmation save confirmed text locally. Speaking directly typed text or a selected phrase commits any parts not already saved. Repeated playback does not save a duplicate. Typing, partial transcripts, unselected suggestions, and audible Preview alone do not save preference sources. A failed Speak attempt still retains the explicitly confirmed intended message.

When Gemini is enabled, source messages and up to eight relevant recent turns are sent through OpenRouter to extract grounded user preferences and personal facts. Personal facts (`personal_fact`, October 24, 2026) cover specifics of the user’s own life: their name, family, friends, pets, and other people (relationship is the role, value is the name), where they live, work, or study, and other proper nouns that belong to them. “Cole” answering “What is your name?” saves name=Cole. They are saved automatically without approval. The app user is the person communicating through SpeakEasy; microphone speech is partner context. A direct answer such as “Salmon roll” following “What is your favorite sushi roll?” can establish the user’s preference. A question, ambiguous answer, quotation, hypothetical, or partner assertion must not establish it.

Zod validates structured output, source quotes, and values. Each quote must occur exactly in the confirmed message and contain the preference value. Facts retain source text, timestamps, game/topic scope, and whether scope was explicit, conversational, or inferred. These checks constrain extraction but do not prove universal model accuracy. Saved facts remain visible with editable fields and Forget controls.

Confirmed sentences, their question context, and authorized learning jobs are committed together to SQLite immediately, before calling the model. Extraction runs in a serialized queue, and its results and completion status are committed together as soon as the model responds. Closing, quitting, or reloading does not discard unfinished work: reopening resumes it when Gemini is enabled. Failed jobs get one retry on reopen or re-enabling Gemini; failures remain available for manual retry without an automatic retry loop. Disabling Gemini aborts extraction while preserving already-authorized pending work. Sources committed while generation was disabled are saved locally and require explicit Retry learning; enabling generation does not upload all old history. Later preference assertions update the matching relationship/scope slot, and source timestamps prevent an older retry from overwriting a newer preference. Personal facts are keyed by relationship, scope, and value, so several siblings or friends coexist and a repeated statement updates its own record; a changed single-valued fact such as a new home city is kept alongside the old one until the user edits or forgets it.

## Context selection and retrieval

The renderer retains at most 500 finalized conversation turns and 250,000 characters in session memory. The eight recent turns remain editable. Partial transcripts and unselected suggestions never enter this archive. Clearing the draft or completing speech preserves the conversation; Clear conversation removes it, and Forget earlier context retains only the recent window. There is no rolling summary.

With generation enabled, the main process synchronizes source turns into a local Moss session and retrieves relevant earlier evidence. One schema-validated OpenRouter decision selects up to eight source IDs, the active topic, time frame, vocabulary, and a focused preference query. Explicit current words have priority, followed by the unfinished authored message, then relevant dialogue. Earlier conversation resolves references or explicit topic returns. The resolver receives no saved preference values from the fact store.

Use saved facts in suggestions (Settings → Gemini → Personal memory) is a separate sharing permission. It is on by default for new preference databases (user decision, October 24, 2026), so saved facts are sent to OpenRouter with generation whenever Gemini is enabled; turning it off keeps facts local. Only permitted saved facts enter the local preference index. Moss uses `moss-minilm` hybrid search with alpha 0.6. The selector preserves SDK hybrid ordering after scope and polarity checks, applies a 0.3 semantic floor and a 0.8 fraction-of-best relevance threshold, deduplicates, and selects at most three facts within 1,800 JSON characters. Uncertain or empty queries return no facts. The recorded gardening paraphrase miss remains a known limitation of this policy.

The context decision is reused when history, recent dialogue, draft, locked message, and explicit words are unchanged. Initials-only changes reuse it. Facts are selected from the current permitted snapshot on every retrieval. Source edits and deletion invalidate derived state and pending results.

Moss replaces cloud fact/query embeddings and the independent preference-topic resolver. Automatic learning and sentence generation use OpenRouter while Gemini is enabled. Moss authenticates and loads its model through its service and sends vendor usage telemetry, including device identifiers; query/document text is not included in that telemetry. No session is uploaded or persisted to disk by this integration. A service-dependent startup means this is not a fully offline generation path.

## Failure, persistence, and forgetting

Configure `OPENROUTER_TOKEN`, `MOSS_PROJECT_ID`, and `MOSS_PROJECT_TOKEN` in the local `.env`; the last value is the project key expected by the SDK. Credentials stay in the main process. Moss is automatic when cloud suggestions are enabled, with no experiment toggle or alternative semantic retrieval provider. A retrieval failure produces an actionable error and preserves exact spelling and the accepted draft.

The main process owns `preferences.sqlite` with owner-only permissions and SQLite `secure_delete`. It stores up to 20,000 committed sentences and 2,000 saved facts in the persistent Electron user-data directory, along with bounded extraction context and job status. SQLite uses full synchronous commits, so saving does not wait for app closure. Saved facts survive composition resets and app/window restarts; the raw session conversation archive remains session-only, and Moss rebuilds its disposable index from saved facts when needed. Current records contain source facts rather than cloud vectors. Stored records are decoded to the current validated fields; no schema migration or alternate legacy retrieval path runs. The app does not provide database encryption, synchronization, or automatic backup.

Mutations cancel active generation and reconcile the local projections. Serialized writes and epochs prevent stale results from reintroducing removed facts. Source-sentence deletion removes dependent saved facts. Forget all deletes facts and sentences and clears the saved-phrase cache. Individual fact forgetting leaves its source sentence visible; explicitly retrying learning can save that preference again. Correction-word memory remains independently controlled.

## Validation

Unit and IPC tests cover confirmation and sharing boundaries, source undo, immediate persistence before extraction, interrupted and queued job recovery, offline retry, disabled-generation recovery, completed non-preference deduplication, restart persistence, stale results, selected evidence, cache reuse, source limits, removal of obsolete controls, and visible failures without an alternate retrieval path. Evaluation datasets and benchmark reports are kept locally and are not part of the application source.

Both live variants passed on October 24, 2026: a full favorite-deck assertion and the short answer “Salmon roll” to a favorite-sushi question. The lifecycle covers: automatically learn a preference from confirmed text, reopen the temporary database, retrieve it with Moss, generate a matching sentence, and forget it. It uses no active-profile data. Run it explicitly with:

```sh
rtk proxy env SPEAKEASY_LIVE_MEMORY_TEST=1 npx vitest run tests/preferences-live.test.ts
```

This lifecycle check does not establish real-user AAC or gaze accuracy.
