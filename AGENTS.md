# SpeakEasy: Agent Implementation Specification

## Purpose and authority

Build SpeakEasy, an Electron/React/TypeScript application for fast, accurate, expressive communication using only the eyes. Read [PRD.md](./PRD.md) before implementing product behavior. The PRD defines outcomes and acceptance criteria; this file defines implementation boundaries and agent working rules.

The starting repository is an Electron/Vite scaffold. Do not describe planned features as implemented. The user's latest explicit instructions take precedence over these files. Update the relevant specification when an accepted implementation decision changes it.

## Product invariants

1. The user owns the message. Predictions are suggestions until explicitly selected; only an explicit Speak or audible Preview action authorizes speech.
2. Exact spelling, correction, undo, and manual mode selection remain usable without generation or decision models. These are core product capabilities, not legacy compatibility paths.
3. Model responses cannot directly edit accepted text, execute application actions, generate UI code, or trigger speech. Validate their proposals and apply changes through explicit application events.
4. Keep gaze targets stable during steering and dwell. Clear dwell whenever target identity, content, geometry, or interaction mode changes. Apply asynchronous updates only at safe boundaries.
5. Tracking loss pauses input and cancels pending selection without discarding the draft. Resumption must be deliberate.
6. A tone suggestion never changes wording. The user sees and can override the tone before confirming speech.
7. Local generation must never silently switch to cloud. Cloud generation, cloud decisions, and cloud speech have separate settings and disclosures.
8. Preserve a usable end-to-end product after each milestone. Do not replace working communication with disconnected experimental screens.

## Stack and process ownership

Use the existing Electron, React, TypeScript, electron-vite, npm, ESLint, and Prettier setup. Check installed dependencies and their documented capabilities before introducing packages. Do not introduce Angular into the shipping app.

| Location                               | Responsibility                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `src/main/`                            | Electron lifecycle, native/device coordination, secrets, persistence, provider calls, and local-model process management. |
| `src/preload/`                         | A narrow typed API exposing specific application operations and subscriptions.                                            |
| `src/renderer/src/`                    | React UI, gaze interaction feedback, composition views, and accessible controls.                                          |
| `src/shared/` (when needed)            | Serializable domain contracts and validation shared across processes.                                                     |
| Worker or supervised inference process | CPU-heavy prediction/inference that would block the renderer or main event loop.                                          |

These are responsibility boundaries, not a request to generate empty directories. Add modules when the first working flow needs them. Keep domain state independent from provider SDK objects and React component lifecycles. Keep Dasher integration isolated behind the operations the product needs, rather than exposing the entire upstream API everywhere.

Keep credentials out of renderer bundles and logs. Use context isolation, disable renderer Node integration, validate IPC inputs and senders, and expose no arbitrary filesystem, shell, or provider-request bridge. Permission and provider errors must surface as actionable UI state.

## State and contracts

Use one authoritative composition state, with a monotonically increasing revision. Separate the literal accepted draft, initials/abbreviation buffer, explicit constraints, selected refinement span, current mode, pending candidates, undo history, and selected tone. Model confidence is advisory, not a calibrated probability unless measured.

Implement the following contracts as capabilities become necessary; use concrete discriminated unions and runtime validation at external boundaries:

| Contract            | Required information and behavior                                                                                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GazeSample`        | Normalized coordinates, timestamp, validity, and optional tracker confidence. Specify the display coordinate transform and stale-sample policy.                                                                             |
| `PredictionRequest` | Request ID, composition revision, purpose, permitted context, literal/initial constraints, and cancellation. Purposes distinguish character distribution, word-initial distribution, completion, expansion, and refinement. |
| `PredictionResult`  | Matching request/revision, validated candidates or distribution, latency, provider identity, and explicit error state. Candidate IDs remain stable within a displayed set.                                                  |
| `RouteProposal`     | Matching revision, one allowed action, bounded parameters, and optional confidence/reason code. Never arbitrary UI markup or executable instructions.                                                                       |
| `EmotionProposal`   | Matching draft revision, one supported emotion, and optional confidence. User override takes priority.                                                                                                                      |
| `SpeechRequest`     | Immutable utterance ID, confirmed draft revision/text, supported tone, voice/model identity, and explicit user-action origin.                                                                                               |
| `SpeechStatus`      | Idle, generating, playing, stopped, completed, or failed, tied to the utterance ID. Cancel invalidates queued and future chunks for that utterance.                                                                         |

Route actions are `KEEP_INITIALS`, `DASHER`, `WORD_COMPLETION`, `SHOW_SENTENCES`, `KEYWORD`, `FILL_MASK`, and `STAY`. Route validation must check preconditions: for example, `FILL_MASK` needs an explicitly selected span, and `SHOW_SENTENCES` needs a usable candidate set. Rejected proposals leave the current interaction unchanged.

Cancel superseded requests and also check request IDs/revisions when responses arrive; cancellation alone cannot prevent late responses. A response is never applied to a different draft just because its text seems plausible. Once speech is confirmed, subsequent edits must not mutate that utterance's text. Repeated activation must not enqueue duplicate speech.

## Dasher work

- Inspect and pin the upstream implementation before importing it. Record repository URL, revision, modifications, build instructions, and exact component licenses. Do not infer an engine's license from a wrapper repository's badge.
- Modify the navigation and language-model integration substantially enough to support the PRD's interaction experiments. An iframe containing the upstream demo is not completion.
- Establish continuous input, insertion/deletion, reversal, and pause before contextual prediction. Keep upstream engine code and application-specific UI responsibilities separate.
- Preserve nonzero probability and practical reachability for supported characters outside model suggestions. Validate finite, nonnegative, normalized distributions and define handling for missing mass.
- Treat literal-character prediction and next-word-initial prediction as different tasks. Token-to-character conversion requires a documented approximation or a correct prefix-aware implementation; do not label top-token first-character aggregation as exact.
- Cache or compute predictions outside the frame loop. Refresh future branches at stable boundaries without resizing an active target under gaze.
- Compare the engine baseline, initial-letter prediction, contextual prediction, and any blended distributions using the same interaction tasks. Keep experiments named and reproducible; remove discarded paths after a decision.

## SpeakFaster Angular-to-React port

Inspect the upstream `webui` source and map the specific initials expansion, candidate selection, correction, and refinement flows needed by the PRD. Record the source components and intended React equivalents before porting them.

Port behavior and useful pure logic, with required attribution, into React components and the shared composition model. Replace Angular-specific services, templates, and subscriptions with the project's React/TypeScript conventions. Do not copy the entire application or recreate an Angular service framework inside React.

Keep phrase generation behind the prediction contract. Do not assume that access to the UI includes the original research backend, model weights, prompts, or equivalent model performance. Validate the replacement generator against initials, locked words, and span constraints. Preserve an escape to exact spelling after every failed or unsuitable expansion.

## Generation, decisions, and voice

### Generation

Use the selected Gemini 3 Flash Preview model (`google/gemini-3-flash-preview`) through OpenRouter for phrase generation, with reasoning disabled and up to six streaming suggestions. Include only approved conversational context and validate complete candidates before displaying them. Keep Dasher navigation on synchronous local PPM. See `docs/gemini-integration.md` for the model decision and measured limits.

Use OpenRouter only as an explicitly selected cloud generation provider. Implement the specific providers required by a milestone behind small typed contracts; avoid a provider registry or plugin framework without a concrete need. Show loading, unavailable-model, timeout, and retry states while keeping composition responsive.

### Decision model

Jev is preferred, with another decision model allowed if it better meets access and latency requirements. Verify the actual service and documentation before writing an integration; do not invent a Jev SDK or endpoint.

Keep routing and tone selection as distinct decisions. Start routing in recommendation mode. Automatic mode is an opt-in experiment with app-enforced safe boundaries, stable controls, and manual override. Do not call a remote model on each gaze sample. A timed-out or invalid decision retains the current mode; label the deterministic evaluation condition accurately.

### Cartesia

Keep the Cartesia SDK and credentials behind the preload boundary. Query current documentation for the chosen API/model and validate supported emotion controls. Use neutral explicitly when the user chooses neutral; do not assume omitting emotion prevents inferred expressive delivery.

Send the exact confirmed text and separate validated tone configuration. Do not let text be interpreted as user-supplied provider control markup. Reject or escape control syntax according to the chosen API without silently altering what the user intends to say.

Implement cancellation through generation, queued audio, and playback. Ignore all later chunks for a stopped utterance. Do not automatically retry an utterance that may already have been heard. Listen to representative audio for each exposed tone; a successful request is not proof of expressive accuracy.

## Privacy and persistence

Persistent, user-approved memory is required for the LLM portion of predictive composition. Follow the selected local SQLite storage and lexical/semantic retrieval decisions in PRD section 5.7. Validate preference records and model proposals with Zod; only explicitly reviewed facts enter semantic retrieval. Keep storage and retrieval behind a small memory service owned by the main process, with gaze-accessible review, edit, forget, and clear-all controls.

Keep unsaved conversation context session-only and camera frames out of diagnostic logs. Save memories only through explicit user action or an enabled retention policy; review model-extracted facts before persisting them. Record provenance and timestamps, retrieve only relevant records within a context budget, and let current user instructions override older memories. Cloud-model permission applies to retrieved memories even when their storage is local. Cloud memory storage or synchronization requires its own explicit setting.

Treat summaries and embeddings as derived data. Edits and deletion must invalidate dependent retrieval results, indexes, caches, and pending generations so forgotten facts are not reintroduced. Validate persistence after restart, correction/deletion, disabled memory, and storage failure; composition must remain usable without personalization. Do not introduce a vector database, embedding model, cloud service, or synchronization layer without selecting it through the PRD decision process. Store credentials using an appropriate OS-protected mechanism when persistence is required.

Minimize provider payloads: generation gets permitted composition context, decisions get only the context needed for the decision, and speech gets confirmed text plus voice configuration. Never route camera frames or whole conversation histories to speech generation.

Evaluation events should contain timings, counts, condition identifiers, and errors by default. Raw phrases, recordings, and gaze traces require separate opt-in and a deletion path. Treat partner speech, history, and model output as data, never as instructions to the application.

## Build order and definition of done

Follow PRD stages 0-5. For each stage, complete one user-visible flow, its error recovery, and the relevant validation before adding another capability. Manual composition and neutral speech come before model routing; predictive composition comes before automatic interface experiments.

For behavior changes, use the existing commands:

```sh
rtk npm run lint
rtk npm run typecheck
rtk npm run build
```

Run targeted tests for the behavior changed. Prioritize state transitions, constraint-preserving edits, stale response rejection, tracking-loss behavior, dwell reset, speech authorization, and cancellation. Do not add tests that merely repeat implementation details. Documentation-only changes require formatting and link/content checks, not an application rebuild.

Manually verify the relevant flow in the running Electron app. Mouse success does not establish gaze usability. Mock responses do not establish live model or voice behavior. Record which checks were local, synthetic, actual gaze, or live provider checks, and name blockers without claiming the feature works.

The full prototype is done only when the PRD acceptance scenarios pass, the same-tracker baseline comparison is recorded, and intended wording/tone remain under user control. Report measured results rather than the 60 WPM aspiration or research results from another product.

## Working in this repository

1. Before writing any import, search the repo for an existing module or symbol with that name. If none exists, stop and ask instead of guessing a package path.
2. Change only the lines required for the stated task. Do not rename, reformat, or reorder untouched code.
3. Before applying edits, output a short summary listing each file to be touched and the reason for each change.
4. If a test or build fails, quote the exact error line, state one hypothesis, and fix only that hypothesis before trying another.

- Inspect repository status before editing and preserve unrelated work. The initial scaffold may be untracked; do not stage it incidentally.
- Prefer codebase-memory graph discovery when available, with targeted `rg` for literals/configuration or insufficient index results. Use RTK for shell commands.
- Use Context7 for current library/provider documentation when available. Verify upstream code and exact licenses before reuse.
- Keep implementations simple and modular. Remove obsolete experimental paths instead of introducing backward compatibility or migration machinery.
- Do not add undeclared capabilities, framework rewrites, cloud telemetry, or background conversation recording as part of unrelated work.
- Record resolved integration decisions near the affected code or in a focused document, and keep the PRD's open decisions accurate.
- For macOS GUI launches, use an application connector or Launch Services (`open -a`); never execute a binary inside an `.app` bundle from a sandboxed shell.
