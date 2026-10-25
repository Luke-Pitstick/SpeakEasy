# Preference memory and sentence commits

Moss is the sole conversation-context and preference-retrieval strategy. SQLite stores committed sentences and approved facts; disposable local Moss sessions search them. The user selected this implementation on October 24, 2026 after testing the combined implementation. Exact correction lookup and saved-phrase matching retain their separate roles.

## Saving and review

Every Use phrase, accepted expansion/refinement, accepted draft word replacement, and Lock sentence saves the committed sentence locally before speech. Literal typing and tentative previews alone do not save. Undo/Back retract the corresponding sentence, associated preference facts/proposals, and cache contribution. Speaking does not save another copy.

Find preferences is an independent opt-in. It sends newly committed sentences and up to eight recent conversation turns to Gemini through OpenRouter. Zod validates the proposal and its supporting quote; the quote must appear exactly in the committed sentence, and the preference value must appear in that quote. Questions, quoted speech, hypothetical choices, and partner preferences are excluded by the extraction prompt. Explicit review remains required because validation cannot prove the model understood ownership or negation.

Each preference records a relationship, value, game/topic scope, related search terms, and source provenance. The review panel exposes inferred associations, editable fields, Approve, Reject, Replace, and Forget. A matching relationship/scope requires explicit replacement. Up to 20 unreviewed proposals last for the current session; approved facts persist across restarts. At most three extraction jobs run concurrently. Saved sentences remain available for an explicit Find preferences retry.

## Context selection and retrieval

The renderer retains at most 500 finalized conversation turns and 250,000 characters in session memory. The eight recent turns remain editable. Partial transcripts and unselected suggestions never enter this archive. Clearing the draft or completing speech preserves the conversation; Clear conversation removes it, and Forget earlier context retains only the recent window. There is no rolling summary.

With generation enabled, the main process synchronizes source turns into a local Moss session and retrieves relevant earlier evidence. One schema-validated OpenRouter decision selects up to eight source IDs, the active topic, time frame, vocabulary, and a focused preference query. Explicit current words have priority, followed by the unfinished authored message, then relevant dialogue. Earlier conversation resolves references or explicit topic returns. The resolver receives no approved preference values from the fact store.

Use approved facts with semantic retrieval is a separate sharing permission. Only permitted approved facts enter the local preference index. Moss uses `moss-minilm` hybrid search with alpha 0.6. The selector preserves SDK hybrid ordering after scope and polarity checks, applies a 0.3 semantic floor and a 0.8 fraction-of-best relevance threshold, deduplicates, and selects at most three facts within 1,800 JSON characters. Uncertain or empty queries return no facts. The recorded gardening paraphrase miss remains a known limitation of this policy.

The context decision is reused when history, recent dialogue, draft, locked message, and explicit words are unchanged. Initials-only changes reuse it. Facts are selected from the current permitted snapshot on every retrieval. Source edits and deletion invalidate derived state and pending results.

Moss replaces cloud fact/query embeddings and the independent preference-topic resolver. Extraction and sentence generation still use OpenRouter under their existing permissions. Moss authenticates and loads its model through its service and sends vendor usage telemetry, including device identifiers; query/document text is not included in that telemetry. No session is uploaded or persisted to disk by this integration. A service-dependent startup means this is not a fully offline generation path.

## Failure, persistence, and forgetting

Configure `OPENROUTER_TOKEN`, `MOSS_PROJECT_ID`, and `MOSS_PROJECT_TOKEN` in the local `.env`; the last value is the project key expected by the SDK. Credentials stay in the main process. Moss is automatic when cloud suggestions are enabled, with no experiment toggle or alternative semantic retrieval provider. A retrieval failure produces an actionable error and preserves exact spelling and the accepted draft.

The main process owns `preferences.sqlite` with owner-only permissions and SQLite `secure_delete`. It stores up to 2,000 committed sentences and 200 approved facts. Current records contain source facts rather than cloud vectors. Stored records are decoded to the current validated fields; no schema migration or alternate legacy retrieval path runs. The app does not provide database encryption, synchronization, or automatic backup.

Mutations cancel active generation and reconcile the local projections. Serialized writes and epochs prevent stale results from reintroducing removed facts. Source-sentence deletion removes dependent approved facts and proposals. Forget all deletes facts and sentences and clears the saved-phrase cache. Individual fact forgetting leaves its source sentence visible; explicitly extracting it again can propose the fact again. Correction-word memory remains independently controlled.

## Validation

Unit and IPC tests cover approval and sharing boundaries, source undo, restart persistence, stale results, selected evidence, cache reuse, source limits, removal of obsolete controls, and visible failures without an alternate retrieval path. Evaluation datasets and benchmark reports are kept locally and are not part of the application source.

The live test passed after adoption on October 24, 2026: extract the fictional Hog Cycle preference, approve it, reopen the temporary database, retrieve it with Moss, generate a matching sentence, and forget it. It uses no active-profile data. Run it explicitly with:

```sh
rtk proxy env SPEAKEASY_LIVE_MEMORY_TEST=1 npx vitest run tests/preferences-live.test.ts
```

This lifecycle check does not establish real-user AAC or gaze accuracy.
