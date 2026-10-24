# SpeakEasy: Product Requirements Document

Status: Full prototype specification. The repository now contains an offline stacked composition experiment with Dasher-derived navigation, SpeakFaster-derived React interactions, shared state, and demo suggestions. Hardware tracking, real generation, persistent memory, routing, and speech requirements below remain unimplemented.

Date: October 23, 2026.

Immediate implementation scope: first build an offline composition experiment with SpeakFaster above Dasher in one shared-theme React workspace, using shared composition state and deterministic demo phrase suggestions behind a replaceable prediction contract. Live LLM integration is deferred for this milestone. The [source-inspected translation and integration plan](./docs/implementation-plan.md) defines the proposed port, layout, incremental gates, and validation; this milestone does not complete the full prototype requirements below.

Accepted interface revision: use a clean flat neutral theme with no green, four large permanent controls (Pause/Resume, Undo, Delete, More), and contextual correction actions. Mode selection and experiment settings belong behind More. Four phrase choices use two columns to preserve room for the direct Dasher letter stream. Dasher takes the remaining height while entering text; phrase and correction choices expand only while paused. Use proportional letter regions, a starting view of the full alphabet, and a visible input marker/vector showing displacement from the center. The [inspected reference pictures and layout decisions](./docs/interface-references.md) supersede the initial plan's decorative workspace presentation.

## 1. Product vision

SpeakEasy is an eye gaze communication application designed to make communication fast, accurate, expressive, and easy to learn. A person should be able to compose exactly what they mean, correct it, choose how it sounds, and speak it using only their eyes, even when their tracker is imprecise.

The product combines substantially modified Dasher navigation with SpeakFaster-inspired abbreviated composition and phrase refinement. Jev, or another decision model, will help choose the next useful interaction and suggest the emotion of the spoken phrase. The central experiment is whether these capabilities work better as one adaptive communication experience than as a fixed sentence generator placed above a gaze keyboard.

“SpeakFast” in the project discussion refers to SpeakFaster. Use SpeakFaster when naming the upstream research and code. Jev is the preferred decision-model candidate, but its exact API, availability, latency, and local deployment capabilities remain unverified.

## 2. Users and the problem

The primary users are people who rely on gaze to communicate because speech and conventional input are difficult or unavailable. The initial product assumes the user can visually navigate the interface and read English; it does not assume that they can turn their head, use a keyboard, or tolerate lengthy calibration. A supporter may help with installation and initial setup, but the communication loop must be independently operable.

Conventional gaze typing makes each selection expensive. Small targets, inaccurate tracking, waiting for dwell selection, correcting mistakes, and reading irrelevant predictions all consume time. Phrase generation can reduce selections, but a plausible sentence can still express the wrong intent. SpeakEasy must reduce total effort without sacrificing exact wording or control over emotional delivery.

## 3. Outcomes and hypotheses

The primary outcome is faster successful communication at the user's intended meaning and tone. The long-term ambition is approximately 60 effective words per minute; this is an aspiration, not an MVP requirement or a demonstrated result.

| Hypothesis                                                                                      | Test                                                                     | Evidence needed to retain the approach                                        |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Large, progressively narrowing regions tolerate noisy gaze better than a conventional keyboard. | Same tracker and prompts, keyboard versus modified Dasher.               | Faster completion or fewer corrections without reduced task success.          |
| Initials and contextual phrase choices reduce expensive input actions.                          | Dasher alone versus Dasher with abbreviated composition.                 | End-to-end time saved after including generation and reading time.            |
| A decision model chooses useful interaction transitions.                                        | Manual switching versus a deterministic router versus Jev/another model. | Additional time or effort saved that exceeds routing and transition overhead. |
| First-letter prediction helps abbreviated entry.                                                | Uniform/character baseline versus next-word-initial prediction.          | Faster intended-initial selection, including uncommon words.                  |
| Suggested emotion improves expression without adding too much effort.                           | Manual tone selection versus model-suggested tone.                       | User-rated tone fit and lower selection effort without loss of control.       |

These are independent experiments. A negative routing result does not invalidate gaze composition or expressive speech.

## 4. Core user journey

1. **Get ready.** Choose the input device, complete a short gaze check, and adjust target size, steering speed, or dwell duration. Setup must not require head turns. Show whether tracking is ready, uncertain, or lost.
2. **Begin a reply.** Start spelling or entering initials using a Dasher-derived continuous navigation surface. Recent, user-approved conversational context may inform suggestions.
3. **Narrow the intent.** Choose from a small set of words or phrases, add a keyword, fill a missing span, or continue spelling. The interface can recommend the next useful mode while preserving the draft.
4. **Correct precisely.** Reject all suggestions, return to an earlier branch, replace a word, undo an insertion, or spell an unexpected name. Correction must be available through gaze wherever composition is available.
5. **Choose expression.** Review the complete draft and its visible tone. Accept a suggested emotion, select another, or choose neutral. Tone changes must never rewrite the message.
6. **Speak deliberately.** A dedicated Speak action confirms the displayed text and tone together. Stop remains available during generation and playback. Finishing or stopping speech must not erase the draft.

Example: after “What do you want to do this weekend?”, the user enters initials, selects “I want to go hiking”, fills a detail with “with Maya”, corrects the name if needed, chooses an excited delivery, and confirms Speak. The model must not infer that the user wants to hike before the user supplies that direction.

## 5. Functional requirements

### 5.1 Gaze input and accessible interaction

- Accept gaze through an input adapter so the communication logic does not depend on one tracker. Start with the tracker that performs best on the actual hardware; pperle is a candidate based on the supplied prior reports, not a verified winner.
- Support mouse input and recorded/synthetic gaze for development and reproducible tests. Demonstrations and results must identify which input was used.
- Provide adjustable smoothing, steering speed, target size, and dwell time. Separate continuous Dasher steering from discrete dwell-based controls.
- Freeze selection and clear pending dwell when samples become stale or tracking is lost. Preserve the draft and require deliberate resumption after recovery.
- Keep Pause/Resume, Undo, Back, Spell, and Speak/Stop in stable positions. Moving or replacing a target must invalidate its previous dwell progress.
- Make all communication actions gaze-operable, with visible focus and selection feedback, readable contrast, and no dependence on color alone. Keyboard access supports testing and helpers but does not satisfy gaze acceptance.

### 5.2 Substantially modified Dasher

Dasher is a foundation to modify, not an unmodified embedded demo. The first integration must support text insertion and deletion, continuous steering, pause/reverse behavior, configurable speed, and a prediction boundary that can be changed without rewriting the rest of the app.

Experiment with character entry, word-initial entry, and word/phrase regions. Preserve progressive narrowing and enough space for low-probability choices to remain reachable. Names, unusual words, punctuation, and corrections must remain possible even when absent from the model's suggestions.

Keep exact spelling and initials entry distinct in state and presentation: a selected initial represents an unknown word, while a selected character extends literal text. Do not silently reinterpret one as the other.

For next-word-initial prediction, aggregate word probabilities by the first letter of the predicted word. For character prediction, use a character distribution. LLM token probabilities are a separate representation: converting them requires explicit handling of spaces, multi-character tokens, partial prefixes, tokenization boundaries, and omitted probability mass. Do not treat the first character of a top token list as an exact character model.

Start with the available Dasher language model as the synchronous navigation baseline. Add contextual prediction only after navigation works. Candidate probabilities may influence future regions at stable boundaries; an arriving model response must not unexpectedly move the region currently being pursued.

### 5.3 SpeakFaster-derived composition in React

Use the upstream Angular UI as a behavioral reference and port the relevant interaction flows into React and TypeScript. Preserve useful initials expansion, candidate selection, word-level refinement, and correction behavior while redesigning their presentation around gaze and Dasher. Do not embed an Angular application inside the product or port unrelated research tooling.

The composition system must:

- Expand initials and optional keywords into a small, diverse candidate set. Start with four visible candidates; evaluate up to six when screen size and tracking allow it.
- Support constrained refinement of one selected word or span while keeping accepted text intact.
- Allow related phrase branches with a visible way back and an undoable selection history.
- Preserve entered initials, explicit wording, and locked spans. Mark incompatible candidates as invalid rather than quietly changing constraints.
- Offer “None of these”, “Keep entering”, and exact spelling without requiring a successful generation.
- Separate unaccepted candidates from the accepted draft. Only accepted text may enter the speech confirmation flow.

### 5.4 Adaptive interface using Jev or another decision model

The decision model chooses among a finite set of authored interaction states. It does not generate arbitrary UI code, control coordinates, or mutate the user's draft.

| Decision          | Meaning                                                    |
| ----------------- | ---------------------------------------------------------- |
| `KEEP_INITIALS`   | Continue entering an abbreviated message.                  |
| `DASHER`          | Enter or correct exact text through continuous navigation. |
| `WORD_COMPLETION` | Offer continuations for the current word or next word.     |
| `SHOW_SENTENCES`  | Present full phrase interpretations.                       |
| `KEYWORD`         | Request an additional user-chosen semantic constraint.     |
| `FILL_MASK`       | Refine a user-selected missing or replaceable span.        |
| `STAY`            | Retain the current interaction.                            |

Inputs may include the current mode, draft, initials, explicit constraints, candidate quality signals, recent corrections, and tracking quality. Context supplied to a cloud decision model is subject to its own permission setting.

The initial mode presents transition recommendations for user acceptance. An experimental automatic mode may apply validated transitions only at defined safe boundaries, such as after a committed selection with dwell cleared and navigation paused. It must be opt-in, visibly indicate its current mode, and provide an immediate return action. Never change modes during active steering or an in-progress dwell.

A late, malformed, unavailable, or irrelevant model response leaves the current mode unchanged. Manual mode selection is a permanent product capability. The deterministic router is an experiment control; do not quietly switch to it and report the result as model-driven routing.

### 5.5 Expressive speech with Cartesia

Cartesia is the selected speech provider. Jev or another decision model proposes a phrase-level emotion from a small supported palette. Begin by evaluating neutral, calm, happy, excited, sad, and angry, and expose only choices verified for the selected Cartesia model and voice.

Emotion is an intended delivery style, not a diagnosis of the user's feelings. Base suggestions on the accepted phrase, explicit user choices, and permitted context; do not infer emotion from gaze or facial movement. Uncertainty or decision-model failure leaves neutral or the user's explicitly chosen tone selected.

Display the chosen tone next to the draft. Changing text invalidates any tone recommendation tied to its old revision. The user can override a suggestion, and Speak confirms the visible choice without forcing an extra confirmation dialog. Preview, if provided, is an explicit audible action subject to the same text and tone validation.

Cartesia documents emotion controls as guidance whose behavior depends on the model, voice, and text. Verify the selected combination by listening; API acceptance alone does not establish the intended delivery. See [Cartesia emotion controls](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion).

Stream audio when supported, expose generating/playing/stopped/failed states, prevent overlapping utterances, and stop queued as well as playing audio. On provider failure, retain the message and offer explicit retry. Do not automatically replay a message after a timeout. Voice cloning is a later, explicit-consent capability; a standard voice is sufficient for the first release.

### 5.6 Context, personalization, and privacy

The LLM must use memory to personalize generation across sessions, including user-approved vocabulary, names, relationships, communication preferences, and relevant past conversations. This requires durable storage outside the model context window. Memory is part of predictive composition, not a deferred feature; the storage backend and retrieval approach remain open decisions.

Separate temporary session context from persistent memory. Session context begins with accepted messages and manually supplied conversation turns. Persistent memories are explicitly saved by the user or retained under a user-enabled policy; model-extracted facts require review before becoming durable memories. Rejected guesses must not become accepted conversational facts, and speaking a sentence does not by itself authorize permanent retention. Partner-microphone transcription remains a later, separately enabled capability.

Prefer local generation. A Llama-family model is the initial candidate, while the inference runtime, checkpoint, quantization, and hardware requirements remain to be selected through measurement. OpenRouter is an explicit cloud generation option. Local generation does not mean the entire product is offline when decision routing or Cartesia uses the network.

Settings must independently disclose and control cloud generation, cloud decisions, and cloud speech. Cloud generation and decision requests send only the necessary approved context; speech sends only the confirmed text and required voice settings. Never silently change from local to cloud after a local failure. Keep unsaved conversation context session-only, keep raw camera frames out of application logs and cloud model requests, and provide gaze-accessible review, edit, forget, and clear-all controls for persistent memory. Saving memory locally does not authorize sending it to a cloud model; provider permissions also apply to retrieved memories.

### 5.7 Memory storage and retrieval options

The application must save approved memories, retrieve a small relevant subset for LLM requests, and preserve them across application restarts. Memory supplies context, not instructions or proof of the user’s current intent. Current explicit input overrides older preferences. Users must be able to correct outdated memories without having to rewrite their conversation history.

Store each memory with an ID, content, category, source/approval provenance, creation and update timestamps, and optional expiry. Keep original records separate from derived summaries or search indexes so edits and deletion can invalidate all dependent representations. Do not send the entire memory store with every generation request. Bound retrieval by relevance and a context budget, and measure its contribution to total prediction latency.

The following are design options, not selected dependencies or commitments:

| Storage option                                                  | Why consider it                                                                                                                   | Tradeoffs and questions                                                                                                                                                                                                             |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local structured files, such as JSON                            | A small set of explicit profile facts is easy to inspect, export, and keep on the device.                                         | The app must handle atomic writes, concurrent updates, search, and recovery. Best suited to a bounded memory collection rather than extensive conversation history.                                                                 |
| Local embedded database, such as SQLite                         | Structured records and transactional updates fit per-user memory, provenance, editing, and deletion without an account or server. | Requires a schema, backup/recovery strategy, and a separate decision about encryption and retrieval. Evaluate as a candidate for a primarily single-device product.                                                                 |
| Local records plus a semantic search index                      | Similarity retrieval could find relevant memories even when the current wording differs from the saved wording.                   | Adds an embedding model, index maintenance, memory/storage overhead, and relevance evaluation. Embeddings are derived data, not the authoritative memory store; assess whether they improve on simpler lookup before adopting them. |
| Cloud database or managed memory service                        | Could support account-based access, backup, and memory shared across devices.                                                     | Adds authentication, network dependency, operating cost, and provider retention/deletion decisions. Requires explicit cloud-memory consent, independent of cloud inference.                                                         |
| Local authoritative storage with optional cloud synchronization | Could retain offline memory access while supporting backup and multiple devices.                                                  | Adds conflict resolution, deletion propagation, and synchronization complexity. Consider only if cross-device use becomes a requirement.                                                                                            |

Storage and retrieval are separate decisions: an embedded database can begin with category, keyword, and recency lookup, while a semantic index can be added only if evaluations justify it. A managed service must be evaluated for what it stores and retrieves rather than assumed to solve memory accuracy automatically.

Before selecting an option, decide the expected memory volume, whether cross-device access is required, offline behavior, encryption and backup requirements, retention defaults, and whether embeddings can be generated locally. Choose one approach for the first implementation; do not build all options. The choice remains open pending these decisions.

When memory is disabled or unavailable, show its status and allow composition without personalization. Do not silently upload memories to recover from a local error. Forgetting a memory must exclude it from subsequent retrieval and invalidate affected pending generations, caches, summaries, and indexes; explain any separately retained source history or backups. Verify both persistence after restart and deletion behavior.

## 6. Architecture and provider boundaries

The application stack is Electron, TypeScript, and React, using the existing Vite setup. The renderer owns the accessible interface and immediate interaction feedback. Native access, credentials, provider connections, and local-model lifecycle belong behind a narrow preload bridge. Heavy inference must not block either rendering or the Electron main event loop.

| Component           | Responsibility                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Input adapter       | Timestamped gaze samples, validity, calibration status, and device lifecycle.                  |
| Interaction engine  | Steering, dwell, target identity, safe transition boundaries, and pause/resume.                |
| Composition state   | Accepted draft, initials, constraints, candidates, history, and revision identifiers.          |
| Prediction service  | Character/initial distributions, word completion, abbreviation expansion, and span refinement. |
| Memory service      | Approved persistent records, bounded retrieval, edits/deletion, and storage status.            |
| Decision service    | Validated route and emotion proposals tied to a composition revision.                          |
| Speech service      | Confirmed utterance snapshots, Cartesia requests, audio playback, cancellation, and status.    |
| Evaluation recorder | Opt-in timings and interaction counts, with content excluded by default.                       |

Use one shared composition state across modes. Keep generation, routing, and speech as separate responsibilities even if a provider eventually supplies more than one. Request cancellation and revision checks prevent stale results from overwriting newer work.

## 7. Scope and delivery sequence

| Stage                          | Deliverable                                                                                                                                                                                    | Exit condition                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Integration decisions       | Select a tracker, inspect/pin Dasher and SpeakFaster source revisions, map the Angular flows, select one local generation setup, and choose a memory storage/retrieval approach.               | Record provenance, licenses, capability limits, and a runnable integration path. Verify Jev access before depending on it.                                |
| 1. Complete communication loop | Gaze input, modified Dasher exact entry, correction, persistent draft, neutral Cartesia speech, and Stop.                                                                                      | Compose, correct, confirm, speak, and stop a new sentence using only gaze; recover from tracking and speech failure.                                      |
| 2. Predictive composition      | React implementations of initials expansion, phrase selection, and span refinement with local generation; explicit OpenRouter configuration; persistent approved memory and bounded retrieval. | Complete both a predictable sentence and an unexpected name, rejecting a wrong suggestion along the way; verify memory across restart and after deletion. |
| 3. Adaptive interaction        | Manual and deterministic controls plus Jev/decision-model routing; prediction-distribution experiments.                                                                                        | Compare conditions on the same tasks, demonstrate stable targets, and reject stale routing responses.                                                     |
| 4. Expressive speech           | Manual emotion palette plus decision-model suggestions.                                                                                                                                        | User selects/overrides tone and speaks exactly the confirmed text; listening evaluation records tone fit.                                                 |
| 5. Evaluated prototype         | Same-tracker gaze keyboard baseline, reproducible experiment settings, and complete demo.                                                                                                      | Publish observed completion times, corrections, failures, and limitations without presenting targets as results.                                          |

The intended experimental prototype includes stages 1-4. Later scope includes partner audio, cross-device memory synchronization, voice cloning, additional languages, and broader hardware support. Model training, a new eye tracker from scratch, clinical effectiveness claims, and production support for every desktop platform are outside the initial scope. Validate on the current macOS development machine first; other Electron build targets require their own validation.

## 8. Measurement and provisional acceptance targets

All numeric targets below are proposed engineering targets. Record actual hardware, tracker, local model, cloud models, settings, and sample size alongside every result.

| Measure                   | Definition and initial target                                                                                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Communication success     | User confirms that the final text expresses their intended message; count failures and abandoned trials. All scripted acceptance scenarios must complete.                                                                   |
| Effective WPM             | Correctly communicated words divided by elapsed minutes from the first composition action to explicit Speak confirmation. Include reading, generation, corrections, and routing time. Report speech-start delay separately. |
| Comparative improvement   | Aim for at least 20% lower median completion time than a conventional gaze keyboard using the same tracker, without worse success or uncorrected error rates. This is a go/no-go experiment target, not a claim.            |
| Input responsiveness      | Target p95 sample-received-to-visible-feedback latency below 50 ms on the reference machine; measure sensor latency separately.                                                                                             |
| Prediction responsiveness | Target p95 usable candidate-set latency below 1.5 seconds with a warmed model. Report cold start separately; navigation must remain responsive throughout.                                                                  |
| Routing usefulness        | Include route-request latency, accepted/rejected transitions, mode reversals, and time spent reading choices. A faster model is insufficient if total communication slows.                                                  |
| Speech responsiveness     | Target p95 confirmation-to-first-audio below 1 second under the documented network conditions; local Stop halts playback within 100 ms.                                                                                     |
| Control integrity         | Zero speech without explicit confirmation, zero stale-result draft overwrites, and zero target-identity changes that inherit dwell progress in the acceptance suite.                                                        |
| Setup burden              | Target usable initial calibration in two minutes without head turns; report unsuccessful attempts and supported accommodations.                                                                                             |
| Expression                | Record user-rated tone fit, manual overrides, and the time added by tone selection. No automatic-emotion advantage is assumed.                                                                                              |

For copy tasks, use a fixed expected message and report uncorrected text error separately from speed. For open conversation, use the participant's confirmation of meaning rather than an LLM grading its own suggestions. State the word-count convention; if reporting five-character standardized WPM, label it separately from actual-word WPM.

Use matched prompts with routine replies, ambiguous intentions, uncommon names, and deliberate corrections. Counterbalance condition order and provide practice. Test natural tracker errors and separately labeled injected noise/dropouts. Compare the keyboard, Dasher alone, manual hybrid, deterministic routing, and model routing incrementally. Separate developer demonstrations from evaluations with people who rely on AAC; small exploratory samples do not establish clinical effectiveness.

## 9. Required acceptance scenarios

1. Enter and speak a novel phrase with gaze alone, then stop a subsequent utterance.
2. Expand initials, reject every candidate, add a keyword, and select a better phrase without losing the original input.
3. Correct one word and spell an out-of-vocabulary name while preserving the rest of the draft.
4. Lose tracking mid-dwell and mid-steering; recover without unintended insertion, mode change, or speech.
5. Receive generation and routing responses for an old revision; neither changes the current draft or active targets.
6. Disable or disconnect the generation/decision provider; exact entry and manual modes remain available, with no hidden cloud request.
7. Change a suggested emotion and confirm speech; verify the utterance uses the exact confirmed text and selected supported tone.
8. Fail or cancel Cartesia generation, then explicitly retry; preserve the draft and prevent overlapping or delayed replay.
9. Compare the full prototype against the same-tracker keyboard and include unsuccessful trials in the report.

10. Save a user-approved memory, restart the app, and verify relevant retrieval. Edit and forget it, then verify stale values cannot reappear through a pending response, summary, or index. With memory disabled or unavailable, complete a message without personalization.

## 10. Open decisions and evidence

- **Tracker and calibration:** benchmark available candidates on the actual machine, including limited head mobility; the supplied reports alone do not settle selection.
- **Dasher fork:** the current [dasher-web repository](https://github.com/dasher-project/dasher-web) uses a WebAssembly build of DasherCore. The implementation plan proposes translating the preserved `legacy-js-demo` source at `3e7854f0fbd543f241472e328d55845087a1cb3b` to TypeScript; this JavaScript version is no longer actively supported upstream. Its inspected navigation code is MIT and its bundled jslm predictor is Apache-2.0. Confirm reversible navigation and safe prediction hooks through the plan's engine parity gate before treating the selection as validated; retain exact component attribution when importing.
- **SpeakFaster port:** the [TeamGleason repository](https://github.com/TeamGleason/SpeakFaster) contains a `webui` tree. Inventory the exact Angular components, state flows, tests, backend assumptions, and licenses before assigning port work; public UI code does not establish access to the research models.
- **Decision provider:** confirm what Jev refers to operationally, its structured-output contract, cost, latency, and deployment options. Keep the authored action contract usable by another decision model without building a generic agent platform.
- **Local generation:** choose a model/runtime pairing through measured candidate quality and latency, not the Llama name alone. Check whether probability access needed for Dasher experiments is actually available.
- **Memory:** choose among the storage options in section 5.7; settle retention, retrieval, encryption, backup, and single-device versus synchronized use before implementing persistence. No storage vendor or semantic search dependency is selected yet.
- **Speech:** verify the chosen Cartesia model, voice, language, emotion mapping, and cancellation behavior before committing to a demo.
- **Hackathon reuse:** the supplied discussion raises prior-project eligibility. Verify current organizer guidance before submitting existing prototype work; this document does not establish eligibility.

Research foundation: [SpeakFaster paper](https://arxiv.org/abs/2312.01532) reports 29-60% faster text entry in two eye-gaze users with ALS. That supports investigating reduced input effort, but does not establish SpeakEasy's speed, usability, or effectiveness. SpeakEasy's contribution to test is the combination of noise-tolerant navigation, adaptive interaction, and user-controlled expressive speech.
