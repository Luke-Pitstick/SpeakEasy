# Preference memory and sentence commits

Every **Use phrase**, accepted expansion/refinement, accepted word replacement in a draft, and **Lock sentence** saves the committed sentence locally, without waiting for speech. Literal typing and tentative previews alone do not save. The explicit Lock sentence control commits directly composed text. Undo/Back retract the corresponding sentence, its associated preference facts/proposals, and its contribution to the suggestion cache. Speaking does not save another copy.

## Data and review

Zod 4 is the schema authority for typed IPC operations, extracted proposals, saved sentences, approved facts, and embedding responses. JSON Schema for the model is generated from the same extraction schema. Objects reject unknown fields; text, counts, subjects, categories, and vector dimensions are bounded. A proposal's evidence quote must occur exactly in the committed sentence, and its value must occur in that quote. This catches malformed and unsupported output, but is not proof that the model understood negation or ownership: explicit review remains required.

A preference has type, subject=user, relationship, value, game/topic scope, and related search terms. Provenance retains the committed text, its initials, a supporting quote, and whether scope was explicit, from conversation, or inferred. For example, favorite_deck=Hog Cycle can be scoped to game=Clash Royale. The UI shows inferred scope so the user can correct it before approval.

Find preferences is an independent opt-in. Once enabled, newly locked sentences are checked in the background with Gemini through OpenRouter, using up to eight permitted conversation turns. The extraction prompt excludes partner assertions, questions, quoted statements, hypotheticals, and transient choices. No preference is accepted automatically. Up to 20 proposals are session-only; restarting discards them. At most three background jobs run concurrently; sentences still save when busy, with an explicit retry action. Enabling extraction does not silently upload old sentences; users can select Find preferences on an existing sentence.

The review panel offers editable fields, supporting evidence, inferred-context labels, Approve, Reject, and explicit replacement of an existing fact. Accepted Dasher text can populate each field using its Use draft button. An existing matching relationship/scope cannot be overwritten by simple approval; replacement is explicit. Approved records can be edited or forgotten independently. This first schema stores preferences, not arbitrary inferred biographical facts.

## Semantic retrieval and consent

Use approved facts with semantic retrieval is a separate opt-in. It uses Gemini through OpenRouter to resolve the current subject from recent turns, draft, locked words, and the temporary historical summary. It then sends only that focused query and approved fact descriptions to **openai/text-embedding-3-small through OpenRouter**, requesting 1,536-dimensional float vectors. Only approved facts are embedded. Vectors are stored with records in local SQLite. Indexing failure leaves the fact saved and offers Retry semantic indexing; unindexed facts are excluded from semantic search.

Locked sentences enter the temporary session conversation immediately. Successful speech does not duplicate an already locked turn, and speaking or clearing the draft preserves this context. Undo retracts the corresponding locked turn. The session keeps the most recent eight turns plus a temporary summary of older turns. With Gemini enabled, outgoing turns are merged into the summary through OpenRouter in batches of up to eight; Zod validates inputs and a maximum 2,000-character output. Summary requests run independently of expansion. Unprocessed turns remain in a session-only queue on failure, with status and retry controls. No summary is generated when Gemini is disabled. Clear conversation or app restart removes the summary and queue; Forget earlier context clears them while retaining the recent window. Pending responses cannot restore cleared context. Undo of a saved sentence discards the compressed summary because it cannot reliably remove one sentence from generated prose.

Before embedding, a Zod-validated query-resolution request produces a maximum 500-character query about the current reply. For an unfinished multi-sentence message, the first locked sentence establishes the topic and following sentences continue it by default. Explicit current words or a later user-authored topic change can redirect it. Heard conversation has lower priority than this authored thought; without a locked message, recent relevant conversation determines the topic. Older summarized context resolves references and continuing topics. The resolver receives no saved facts and is instructed to describe the subject being sought rather than copy remembered answers. Expansion embeds only the resolved query, so historical topics do not automatically contribute to similarity. Initials alone are not used as a semantic query; when natural-language context is absent, exact saved-source initials can select an indexed fact. Local cosine ranking uses a provisional 0.30 cutoff and returns at most three facts within 1,800 JSON characters. This is separate from the correction-memory context budget. The cutoff is an engineering default, not a validated accuracy claim. Existing initial/prefix/locked-word validation always wins over memory.

Generation remains separately controlled by Gemini consent. Cached sentence candidates can appear before semantic retrieval completes. Query-resolution, embedding, and extraction requests each have 12-second timeouts and bounded responses; retrieval failure surfaces status and allows expansion without preference facts. An empty or invalid resolved query does not fall back to embedding the whole conversation. Query resolution adds one model request before embedding; cancellation or memory changes discard its result before further requests. There is no hidden switch to another service. Actual extraction quality, semantic relevance, and added latency still need live measurement.

## Persistence, forgetting, and race safety

The main process owns preferences.sqlite with owner-only file permissions and SQLite secure_delete. It stores up to 2,000 committed sentences and 200 approved facts. Hitting a cap reports an error rather than silently discarding history. There is no app-level encryption, external vector database, synchronization, or automatic backup.

Edits clear obsolete vectors before reindexing. Mutation epochs and abort signals prevent stale extraction/index/query results from restoring forgotten or replaced facts. Main-process invalidation cancels active generation, and composition revisions reject already-staged output. Pending proposals are cleared on fact forgetting. Forgetting a sentence also removes approved facts sourced from it. Forget all deletes both fact and sentence tables and clears the sentence suggestion cache. Correction-word memory is a separate store.

Forgetting an individual fact leaves its source sentence visible. Sources are not automatically reprocessed; explicitly choosing Find preferences on that sentence can propose the fact again. Current composition text and session conversation are not erased. External OS backups are outside the application's deletion control.

## Verification

Automated tests cover schema rejection, quote grounding, review before retrieval, opt-in boundaries, commit-before-speech, source undo, restart persistence, vector-based paraphrase matching using mocked embeddings, unrelated-query exclusion, explicit replacement, editing, and late-response deletion safety. UI tests cover inferred-scope review, editing, approval and forgetting. Mock embedding tests establish wiring and ranking, not real embedding quality or actual gaze usability.

References: [Zod JSON Schema](https://zod.dev/json-schema), [OpenRouter embeddings](https://openrouter.ai/docs/api/api-reference/embeddings/submit-an-embedding-request).

## Live Clash Royale check — October 24, 2026

The opt-in test in `tests/preferences-live.test.ts` passed against the configured OpenRouter account, using real Gemini extraction/expansion and OpenAI embeddings. It used a temporary SQLite database and removed it afterward; the active app profile was not changed.

- Committed “My favorite deck is Hog Cycle” before speech, with a preceding question identifying Clash Royale.
- Extracted `favorite_deck = Hog Cycle`, scoped to `Clash Royale`, with the original quote and initials `mfdihc`; the proposal correctly marked the game association as coming from conversation.
- Verified that no fact was approved automatically, then approved the matching fact and generated its embedding.
- Closed and reopened the store, then retrieved the same preference for a new question about the user's usual Clash Royale deck.
- Sent retrieved facts in the actual expansion payload with new initials `iphc`. Observed candidates included “I prefer Hog Cycle.” and “I play Hog Cycle.”
- Retrieved and used the fact for “What do you usually run when we battle?” after locking the preference, completing speech, clearing the draft, and adding an intervening “Sounds good.” turn. The test uses the real composition reducer to retain the earlier topic, then after eight more turns evict both named topics from the verbatim window. Real Gemini summarization retains Clash Royale; retrieval and expansion use that temporary summary successfully.
- Retrieved no fact for a dinner question, and no fact after explicit forgetting.

An earlier probe exposed missing conversational context. Locked sentences now enter session context before speech, and semantic retrieval uses the complete eight-turn window instead of truncating it to two turns. The passing scenario establishes this flow, not general retrieval accuracy or relevance across arbitrary topic changes. The check verifies service/provider wiring and real output, not the native review UI, real gaze use, or improvement over a no-memory baseline.

Normal tests skip paid requests. Explicitly rerun this scenario with:

```sh
SPEAKEASY_LIVE_MEMORY_TEST=1 npm exec vitest run tests/preferences-live.test.ts
```

The test reads the existing OpenRouter key without printing it and sends only the synthetic scenario above. Its automatic approval is limited to the verified test proposal; the product still requires user review.

The summary is visible in Conversation settings and never written to SQLite or automatically promoted to approved preference memory. Expansion treats it as lossy historical context; recent dialogue and current constraints take precedence. This check does not establish summary fidelity across arbitrary conversations or topic changes.

## Live topic-switch check — October 24, 2026

Extended `tests/preferences-live.test.ts` to preserve the Clash Royale summary while changing the conversation to dinner, then returning to the game. All requests use `iphc`, which permits both “I prefer Hog Cycle” and “I prefer hot chicken,” so initials alone cannot distinguish the topics.

Both the explicit transition (“Let's talk about dinner…”) and a natural dinner question without a transition cue passed in separate real-provider runs. The retained regression uses “What would you like for dinner: hot chicken or pasta?” followed by “Which would you pick?” Both produced hot-chicken suggestions and no Hog Cycle or Clash Royale candidates. Returning with “Back to Clash Royale: which deck do you prefer?” produced Hog Cycle suggestions again. The original summary remained intact throughout.

Before the current-topic retrieval change below, retrieval still returned the Hog Cycle fact during dinner (cosine about 0.59–0.60) because the combined semantic query includes historical context. The expansion model respected the current dialogue and ignored that irrelevant fact. This verifies observed expansion behavior in these two runs, not topic-aware exclusion at retrieval or a guarantee across arbitrary conversations. No production behavior was changed for this check; the test and evidence were added. All provider calls used synthetic data and a temporary database, leaving the active app profile unchanged.

## Current-topic retrieval — October 24, 2026

The live topic-switch regression now asserts that dinner retrieval itself returns no facts, while switching back retrieves Hog Cycle. The passing real-provider run resolved dinner to “my preference for dinner between hot chicken or pasta” and its elliptical follow-up to “my preference between hot chicken or pasta for dinner.” Both scored about 0.11 against the Hog Cycle preference, below the unchanged 0.30 cutoff, and returned no facts. Returning to the game resolved to “preferred Clash Royale deck,” scored about 0.60, and retrieved Hog Cycle. The historical summary and approved fact remained intact. Dinner expansions stayed food-related; the return produced Hog Cycle suggestions.

Topic resolution adds one Gemini request before semantic query embedding when natural-language context exists and is not cached. Unit coverage checks bounded schema validation, focused-query wiring, no broad-history fallback on empty or invalid output, and discarding delayed resolution after retrieval is disabled. The live test establishes this specific conversation flow, not general topic-resolution accuracy. All data remained synthetic and isolated from the app profile.

Presentation overview: [Short-term and long-term memory](./memory-presentation.md).

## Session topic cache

The service keeps one in-memory entry for the resolved topic and its query embedding. Its key is the exact resolver payload: ordered speaker/text turns, historical summary, preceding locked sentences in the unsent message, draft, and locked words. Request IDs, revisions, turn IDs, initials, and prefixes are excluded because the resolver does not use them. Repeated expansions with unchanged semantic context reuse both provider results; any context change replaces the entry on the next retrieval. Only successfully completed, non-cancelled results are cached. Empty resolved queries are valid cached results, while provider errors are retried. A failed embedding can retry without redoing a successful topic resolution.

Facts are read and ranked anew on each retrieval, never cached. Memory mutations, disabling retrieval, and service close clear the topic cache. Stale responses from earlier contexts cannot populate the current entry. In-flight requests are not shared, so an expansion cancelled before resolution finishes may require a new call. The live topic-switch test also repeats retrieval with different initials and asserts zero additional provider calls for each unchanged context.

## Authored-message continuity check — October 24, 2026

The live regression passed using `google/gemini-3.8-flash` with low reasoning for generation, extraction, summary, and topic resolution. An unfinished Clash Royale message retrieved Hog Cycle and produced game expansions despite a newer dinner question. An unfinished dinner message returned no game facts and produced hot-chicken expansions despite a newer game question. An explicit dinner transition in the authored message, and explicit hot/chicken word constraints, both redirected retrieval to food with no Hog Cycle facts or suggestions. Returning to Clash Royale still retrieved the saved preference; unchanged-context retrieval reused the topic cache without additional calls.

This synthetic run passed in about 40 seconds using an isolated temporary database. It verifies these specific conflicting-context scenarios, not accuracy across arbitrary conversations. Structured requests use latency-prioritized routing and sufficient output budgets for low reasoning; reasoning text is excluded from the response.
