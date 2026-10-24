# Dasher + SpeakFaster TypeScript integration plan

Date: October 23, 2026. Status: implementation proposal based on source inspection; no product code has been ported.

Implementation update: the offline workspace now exists as a typed adaptation of the inspected mechanics, with local engine/composition/React tests. The later user-requested [flat interface direction](./interface-references.md) supersedes the visual layout details below. See [source-manifest.md](./source-manifest.md) for exactly what was adapted; full upstream parity and the hardware/provider portions of the PRD are not established by this implementation.

## 1. Recommended implementation

Build one React composition workspace with SpeakFaster above Dasher. Port the preserved JavaScript Dasher navigation core into typed, framework-independent modules, and rewrite SpeakFaster's relevant Angular components in React. Share one composition reducer; keep Dasher geometry, pointer samples, animation, and prediction caches outside React state.

The first deliverable is an offline experimental composition loop: steer initials in Dasher, explicitly request expansion, review four demo phrases, accept one, correct a word, and undo. Demo generation must be asynchronous and use the same request/result contract that a future LLM adapter will implement. It must not pretend to generate arbitrary phrases.

This is a bounded integration milestone before the full PRD prototype. Live LLMs, persistent memory, automatic routing, actual tracker integration, Cartesia, and tone inference remain later work. Mouse and synthetic-gaze validation establish the port's behavior, not gaze usability or model quality. Do not add an active Speak button until actual speech and cancellation are implemented; selecting a candidate never authorizes speech.

## 2. Inspected sources and important findings

### Local application

`src/renderer/src/App.tsx` is the starter screen; `assets/main.css` centers that screen rather than providing a workspace. `src/main/index.ts` creates a 900 × 670 window with sandboxing and context isolation enabled and Node integration disabled. The preload exports the broad Electron toolkit bridge, and the main process contains a demonstration `ping` handler. There is no composition model, prediction provider, Dasher engine, or test script.

Keep the installed React, TypeScript, Electron, electron-vite, and CSS setup. No runtime state library, Angular runtime, RxJS, component framework, or provider registry is needed for this milestone. Introduce a focused test runner when behavior implementation begins; proposed development dependencies are Vitest, React Testing Library, and jsdom, with versions checked against the installed Vite/React toolchain before installation.

### Dasher: select the JavaScript source deliberately

| Source                                                                                                                                           | Pinned revision                                                            | Finding                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Current dasher-web](https://github.com/dasher-project/dasher-web/tree/6507bd38683347585069297451e0a6e74d50c791)                                 | `6507bd38683347585069297451e0a6e74d50c791`                                 | Current README describes a WebAssembly build of C++ DasherCore. Its JavaScript wrapper is not a JavaScript engine port.                                                                                              |
| [Preserved JavaScript implementation](https://github.com/dasher-project/dasher-web/tree/3e7854f0fbd543f241472e328d55845087a1cb3b/browser/dasher) | `3e7854f0fbd543f241472e328d55845087a1cb3b`, resolved from `legacy-js-demo` | Actual JavaScript engine, SVG renderer, pointer control, and predictors. This is the proposed TypeScript source. Upstream explicitly marks it as no longer actively supported.                                       |
| [Migration assessment](https://github.com/dasher-project/dasher-web/blob/6507bd38683347585069297451e0a6e74d50c791/docs/dasher-js-migration.md)   | Current revision above                                                     | Identifies coupling between prediction, SVG mutation, and UI, and discusses a separate canvas approach. Treat this as design commentary, not evidence that such a replacement exists in the inspected legacy source. |

Port the legacy JS implementation as an owned source fork. Do not retain a legacy runtime alongside the port, embed an iframe, or call a typed WASM wrapper a TypeScript engine translation. Keep SVG for this plan: changing the algorithm, language, framework integration, and rendering technology simultaneously would obscure behavioral regressions. The renderer remains a separate module, but a second renderer is outside this milestone.

The actual output is a snapshot, not an insertion callback: `UserInterface._start_render()` finds `zoomBox.holder(0, 0)` and reads its `message`. Root promotion and ancestor restoration occur in the same loop. Reversing can shorten or change that message, so an append-only integration would corrupt the shared buffer.

`ControllerPointer._predict_weights()` currently invokes an async predictor and then rearranges children directly. This needs a safe application boundary; typing the function alone would preserve the risk of changing an active region. `Pointer` also owns DOM listeners and an automatic pause/resume overlay. Extract input math and replace those lifecycle policies with SpeakEasy's explicit pause rules.

### SpeakFaster: behavioral React rewrite

Inspect against [TeamGleason/SpeakFaster revision `fb80a71fe846b03cad48654b76e4ff039aee475f`](https://github.com/TeamGleason/SpeakFaster/tree/fb80a71fe846b03cad48654b76e4ff039aee475f/webui). Its `webui/package.json` uses Angular 12, RxJS 6, TypeScript, and Jasmine/Karma. Most of the language translation is already done; the work is separating behavior from Angular services, subscriptions, mutable component fields, and CefSharp host operations.

The inspected `abbreviation.component.ts` expands initials, displays choices, turns phrases into word chips, and offers separate injection/speech actions. `input-bar.component.ts` manages initials, literal keywords, spelling individual chips, and word replacement. `abbreviation-refinement.component.ts` calls `fillMask` and reconstructs a phrase. `input-text-predictions.component.ts` handles completion and has a timestamp guard for out-of-order responses. These are the behavior sources to port.

Several upstream choices must change: no injected keystrokes, implicit speech, console logging of phrases, automatic name substitution, or punctuation stripping from accepted text. Replace timestamp-only freshness checks with explicit request IDs and composition revisions. Preserve source text on refinement cancellation; do not reproduce the upstream empty-string abort payload. `phrase-editing.component.ts` edits saved contextual phrases, so it is not the main source for draft correction.

The upstream service exposes `expandAbbreviation`, `textPrediction`, and `fillMask` over configurable HTTP endpoints, with Angular Observables and old/new endpoint compatibility logic. The port needs the three capabilities, not those transports, account APIs, or compatibility branches. Source access does not establish access to the original generation model.

### Reuse and attribution

The inspected [Dasher JS license](https://github.com/dasher-project/dasher-web/blob/3e7854f0fbd543f241472e328d55845087a1cb3b/LICENSE) is MIT, copyright ACE Centre-North; the [SpeakFaster license](https://github.com/TeamGleason/SpeakFaster/blob/fb80a71fe846b03cad48654b76e4ff039aee475f/LICENSE) is MIT, copyright TeamGleason. Dasher's bundled [`third_party/jslm`](https://github.com/dasher-project/dasher-web/tree/3e7854f0fbd543f241472e328d55845087a1cb3b/browser/dasher/third_party/jslm) PPM/vocabulary files have Google Research Apache-2.0 headers and their own license. Preserve those separately, include applicable notices, and mark modified files.

At import time create a source manifest with repository, commit, original path, destination, modifications, license, and reproducible build commands. Copy full applicable licenses into `licenses/` and summarize reuse in `THIRD_PARTY_NOTICES.md`. Use a small project-authored training fixture initially; do not copy bundled books, language catalogues, vendor bundles, or image assets incidentally. C++/WASM code and its license are outside this selected source set.

## 3. Source-to-port map

All Dasher source paths below are relative to `browser/dasher/` at the pinned JS revision. Proposed destinations are relative to `src/renderer/src/features/dasher/`.

| Upstream source                                              | Proposed destination          | Translation work                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zoombox.js`                                                 | `engine/ZoomBox.ts`           | Preserve tree construction, hit testing, root promotion/restoration, code-point messages, and reversal. Explicitly type absent nodes and controller metadata. |
| `controllerpointer.js`                                       | `engine/PointerController.ts` | Preserve steering/zoom math; replace callback mutation with validated distribution snapshots and staged branch updates.                                       |
| `limits.js`                                                  | `engine/Geometry.ts`          | Preserve coordinate/size calculations; remove debug DOM drawing from the geometry model.                                                                      |
| `palette.js`                                                 | `engine/Alphabet.ts`          | Port supported characters, groups, whitespace labels, and lookup maps. Replace upstream CSS names with semantic palette roles.                                |
| `viewer.js`, required `piece.js` operations                  | `rendering/SvgRenderer.ts`    | Keep imperative SVG inside one owned subtree. Use typed native DOM operations for the small required SVG subset; omit the general page-builder machinery.     |
| `pointer.js`                                                 | `input/steering.ts`           | Extract coordinate and speed logic; replace window handlers and pause overlays with application-controlled samples/lifecycle.                                 |
| Render/output/root logic in `userinterface.js`               | `DasherEngine.ts`             | Extract the frame loop and output snapshots. Remove control panel, game, speech, storage, mobile layout, diagnostics, and demo bootstrap.                     |
| `third_party/jslm/ppm_language_model.js`, `vocabulary.js`    | `prediction/ppm/`             | Type the existing context/vocabulary/PPM algorithm with Apache attribution. Avoid global model instances.                                                     |
| `predictor_ppm.js`                                           | `prediction/PpmPredictor.ts`  | Rebuild the adapter around bounded contexts and complete probability vectors; remove logging, book imports, and global initialization.                        |
| `predictor.js`, `predictor_dummy.js`, `predictor_ppm_new.js` | Reference only                | Use uniform weights as an explicitly named experiment. Do not import overlapping predictor implementations or the vendored package.                           |

The PPM adapter deserves a targeted regression: the inspected loop sets `numVocabSymbols = currentProbs.length - 1` and iterates while `i < numVocabSymbols`, leaving the last vocabulary entry outside the explicit assignment. Enumerate the complete supported alphabet, excluding only the root sentinel, and verify mass and coverage instead of copying the loop mechanically.

SpeakFaster paths below are relative to `webui/src/`; proposed destinations are under `src/renderer/src/` unless specified otherwise.

| Upstream source                                                                      | Proposed React/domain equivalent                                                           | Scope                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/abbreviation/abbreviation.component.ts` and template                            | `features/speakfaster/SpeakFasterPanel.tsx`, `CandidateGrid.tsx`                           | Expansion lifecycle, four choices, retry, empty state, rejection, explicit acceptance.                                                                                                 |
| `app/input-bar/input-bar.component.ts` and template                                  | `composition/reducer.ts`, `AbbreviationEditor.tsx`, `DraftEditor.tsx`                      | Shared initials/keyword tokens, accepted text, explicit spelling target, selection, correction, cancel, undo.                                                                          |
| `app/input-bar-chip/`, `app/phrase/`                                                 | `TokenChip.tsx`, `CandidateCard.tsx`                                                       | Large labeled targets using common controls; no upstream per-card injection or speech shortcuts.                                                                                       |
| `app/abbreviation-refinement/`                                                       | `RefinementPanel.tsx` plus reducer actions                                                 | Constrained replacement of a selected word/span, retry, back, exact spelling. Preserve surrounding bytes and punctuation.                                                              |
| `app/input-text-predictions/`                                                        | `CompletionChoices.tsx`                                                                    | Demo completion in the same stable choice region after the expansion loop works.                                                                                                       |
| `app/types/abbreviation.ts`, useful `utils/text-utils.ts` functions                  | `composition/abbreviation.ts`; serializable prediction types in `src/shared/prediction.ts` | Preserve token/keyword concepts and lineage where useful; remove virtual-key, eraser-sequence, and host dependencies. Explicitly type initials, complete words, and optional prefixes. |
| `app/speakfaster-service.ts`                                                         | `prediction/PhrasePredictor.ts`, `DemoPhrasePredictor.ts`                                  | Small async port for expansion, completion, and refinement. No Angular HTTP or endpoint compatibility.                                                                                 |
| `app/types/app-state.ts`, Angular modules, `utils/cefsharp.ts`, external events      | Replace, not import                                                                        | Reducer state and typed application events replace global app modes, Subjects, DOM box registration, and OS key injection.                                                             |
| Auth, partners/context capture, quick phrases/favorites, study tooling, logging, TTS | Deferred                                                                                   | They are independent capabilities, unnecessary for the requested port experiment.                                                                                                      |

Reuse test scenarios rather than the Angular test harness. The inspected abbreviation/input-bar specs cover expansion, keyword spelling, chips, correction, and selection. Dasher's inspected Cypress test only checks core controls and takes a screenshot; it does not establish zoom/reversal correctness. New engine trace tests are necessary.

## 4. Shared composition, separate engine state

Use a pure reducer owned by `CompositionProvider` with React context for state and dispatch. Both panels subscribe to this state. SpeakFaster never scrapes Dasher's DOM, and Dasher never mutates a SpeakFaster component instance. React's [reducer/context pattern](https://react.dev/learn/scaling-up-with-reducer-and-context) fits this scope without another store dependency.

| Authoritative application state                                             | Private engine/view state                                                     |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Monotonically increasing composition revision                               | Zoom tree, root history, viewport geometry                                    |
| Exact accepted draft and editing selection                                  | Current pointer sample and frame timestamps                                   |
| Abbreviation tokens, literal constraints, pending keyword                   | Cached character distributions and branch preparation                         |
| Explicit input target: initials, draft span, keyword, or replacement buffer | SVG node references and animation handle                                      |
| Candidate set/request metadata, selected refinement span, branch history    | Temporary visual feedback; discrete dwell timer in the interaction controller |
| Undo snapshots and application pause/input status                           | Engine session ID and output sequence                                         |

Keep the reducer independent of React. Candidate arrival changes suggestion state, not the composition revision or accepted draft. Every user change that invalidates interpretation—text, tokens, constraints, selected span, or input mode—increments the composition revision and cancels pending generation. Undo restores content with a **new** revision; it never rolls the revision counter backward.

### Dasher output contract

Expose only the operations needed by the application: mount/dispose, resize, set input sample, pause/resume, start an edit session, and subscribe to output changes. Keep upstream engine classes private to the feature.

Each edit session captures an ID, current revision, target identity/range, immutable surrounding text, and its editable seed. Emit `{ sessionId, sequence, text }` only when the crosshair's output actually changes. `text` is the entire editable session segment, not the entire application draft. The reducer applies the snapshot atomically to that session's target and rejects old sessions or repeated/out-of-order sequences. Each accepted snapshot advances the composition revision but does not invalidate its own active engine session.

Seeding an edit session must replay the editable seed into engine context and reconstruct a reversible path; passing a string to a display field is insufficient. Reverse navigation may delete within the session segment, but cannot cross its protected boundary into unrelated accepted words. Test seed → reverse → forward explicitly.

An edit originating outside Dasher—candidate acceptance, undo, chip selection, direct helper-keyboard edit—pauses the engine, ends the session, applies one reducer transaction, then prepares a new session from the authoritative target. It does not feed the updated string back into the engine on every render. Manual Resume starts steering again.

Group continuous steering into an undo transaction from Resume until Pause, Expand, or a target change, so Undo reverses a meaningful entry run rather than individual animation frames. Candidate acceptance and span replacement are separate undo transactions. While paused, Backspace performs one defined character deletion in the active buffer and reseeds the engine.

### Initials and literal text

Start in an explicitly labeled Initials mode: `iwac` means four unknown words. Exact Spelling writes literal text to the draft or a selected replacement buffer. Switching modes preserves both buffers and never silently converts one into the other.

Show initials as individual editable chips. Selecting an initial and choosing Spell word directs Dasher into a temporary literal buffer; Done replaces that initial with a locked word token, while Cancel restores the original initial. For example, `i w a c` can become `i w a coffee`. Separate optional semantic hints from locked positional words so constraints are unambiguous.

Expansion captures its destination as well as its source: append at the current draft selection or replace an explicitly selected span. Acceptance applies only to that captured target if the revision still matches. Keep the original abbreviation in branch/undo history; None of these leaves it editable. Back returns to the previous phrase branch, while Undo reverses the last accepted edit.

## 5. Demo prediction with a real integration boundary

Define discriminated serializable requests in `src/shared/prediction.ts`. Required metadata: request ID, composition revision, purpose, bounded permitted context, abbreviation tokens/locked constraints, and captured replacement target where applicable. Purposes for this milestone are `expansion`, `completion`, and `refinement`; character/initial distributions have a separate typed interface because they are navigation weights, not phrase strings.

`PhrasePredictor.predict(request, signal)` returns a Promise of a result carrying the matching request ID/revision/purpose, provider identity (`demo`), elapsed time, and either validated candidates or a structured error. Keep `AbortSignal` local to the caller; it is not serialized over IPC. A future IPC adapter sends cancellation using the request ID.

Use three or more authored fixture families, keyed by tokens, target, and constraints:

- `iwac` returns four compatible choices, including “I want a coffee” and “I want a cookie”; locking `coffee` filters out incompatible phrases.
- A selected word in “I want a coffee” produces replacement proposals only for that range; the application constructs the preview using unchanged prefix/suffix text.
- Unknown initials produce an honest empty result, with Keep entering and Exact spelling still available. An uncommon name can always be entered literally.

Fixtures should include a second candidate branch for Back/Undo demonstrations and a completion example. Use a deterministic delay, with explicit development scenarios for empty results, errors, timeout, malformed output, and a late response that ignores cancellation. Identify the UI as Demo suggestions. Do not put fixture strings inside components or send requests on every pointer sample.

On Expand/Refine, pause Dasher and snapshot the request. Validate schema, candidate count, nonempty bounded strings, duplicate choices, initials alignment, locked words, and replacement range. Keep unsupported proposals out of actionable slots and show a concise rejected-result status; never silently relax constraints. Render text as text, never HTML.

Cancel superseded work, but also reject mismatched IDs/revisions when results arrive and again at selection. Apply valid results only at a safe interaction boundary. Retry creates a new request ID even if the content revision is unchanged. Invalid/failed requests preserve all user text.

Later, implement one real provider behind this same port through a narrow preload API into the main process. Provider credentials, local-model processes, permitted memory retrieval, and cloud consent belong there. Validate IPC senders and payloads and cancel by request ID. No live provider or empty provider framework is required now. Persistent approved memory remains a prerequisite for the later LLM milestone under the PRD, not for canned demo suggestions.

## 6. Vertically stacked layout and one theme

Use one full-window CSS grid, with SpeakFaster occupying approximately 45% of usable height and Dasher the remaining 55%. This is a starting experiment setting, not an established optimal ratio. Keep both mounted and visible throughout composing and refining.

```text
┌──────────────────────────────────────────────────────────────┐
│ SpeakEasy        Demo suggestions        Input / Pause status │
├──────────────────────────────────────────────────────────────┤
│ SPEAKFASTER                                                  │
│ Accepted draft / selectable words                            │
│ Initials and locked-word chips       Expand · Spell word      │
│ ┌──────────────────────────┐ ┌─────────────────────────────┐ │
│ │ Candidate 1              │ │ Candidate 2                 │ │
│ ├──────────────────────────┤ ├─────────────────────────────┤ │
│ │ Candidate 3              │ │ Candidate 4                 │ │
│ └──────────────────────────┘ └─────────────────────────────┘ │
│ None of these · Keep entering · Back                         │
├──────────────────────────────────────────────────────────────┤
│ DASHER       Initials / Exact spelling       Editing: …       │
│                                                              │
│              continuous zooming letter regions               │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Pause / Resume              Undo             Backspace       │
└──────────────────────────────────────────────────────────────┘
```

The accepted draft and initials are shared-state views in the upper panel; the lower panel shows only its active target/status, avoiding a second independently editable draft. Refinement reuses the same four choice slots and preserves their geometry. Do not expand a panel when loading, empty, or error text appears; reserve a status row.

Use `tokens.css` for background/surface, text/muted text, border, accent, danger, focus, dwell, spacing, radius, and typography. Shared `ActionButton`, `StatusLine`, and token/candidate surfaces consume the same tokens. SVG regions consume palette tokens from the same theme, with alternating related hues and legible labels. Remove both upstream appearances and the Electron starter styling. Default to the system light/dark preference with a manual override; apply theme/layout changes while paused and clear dwell.

Start with 64 CSS-pixel action targets, roughly 20–24px body/candidate text, larger draft text, and visible keyboard focus. These are adjustable starting values, not gaze certification. Use text labels as well as color for modes, selection, disabled states, and errors. Avoid decorative motion and truncation that hides candidate meaning; constrain demo phrase length to fit the reserved slots.

Set a proposed 1280 × 900 starting window and test a 1024 × 768 minimum viewport. Measure available content height before finalizing minimum window dimensions. If four readable candidates and a usable Dasher surface cannot fit, raise the minimum rather than shrinking controls below the tested target size. Keep four candidates for this milestone; six is a later PRD experiment. Offer paused-only height presets rather than a gaze-driven draggable divider.

### Input transitions and stable targets

Entering the upper panel suspends steering immediately; returning to Dasher does not resume it automatically. An explicit Resume is required. This prevents glancing at a phrase from inserting extra characters while attention is elsewhere.

Separate continuous steering from discrete action dwell. Candidate targets use stable IDs scoped to a candidate set, not array indices alone. Replacement content, mode changes, geometry changes, tracking loss, blur, and resizing clear dwell and require a fresh activation. A response arriving mid-dwell is staged until the pointer/gaze leaves the target or the user explicitly pauses; it cannot inherit an old target's progress.

Use the lower panel's actual bounding rectangle for screen-to-engine coordinates, with resize observation and explicit device-pixel handling. Pause and invalidate the transform on resize. Add a typed sample adapter for mouse and synthetic input; invalid/stale samples pause input and preserve the draft. Real hardware calibration and gaze accuracy remain separate work.

## 7. Implementation sequence and gates

1. **Freeze sources and establish the workspace.** Record the pinned manifest/licenses and add the shared theme, vertical shell, pure composition reducer, and accessible manual text/initials controls. Remove starter chrome and unused demo IPC exposure. Both panels render from one state; helper input, mode selection, cancel, and undo work before porting navigation. Gate: literal text and initials remain distinct, and resizing preserves the draft.

2. **Port a working Dasher slice.** Type the alphabet, geometry, tree, steering, and SVG rendering modules; extract one disposable frame loop and output-session adapter. Start with explicit uniform weighting, then port the existing PPM algorithm/adapter as the literal-entry baseline before declaring the slice complete. Initials use a clearly labeled uniform distribution initially; character PPM is not a next-word-initial model. Gate: enter, reverse/delete, re-enter, pause/resume, seed an existing segment, and undo through the shared state without duplicate updates or frame-loop leaks.

3. **Connect SpeakFaster expansion end to end.** Add the request contract, deterministic async demo provider, abbreviation chips, and four candidate slots. Expand a Dasher-entered abbreviation and explicitly accept a phrase into the draft. Implement None of these, Keep entering, empty/error/retry/cancel, and stale-result rejection in this slice. Gate: `iwac` travels through Dasher → shared initials → demo request → candidates → accepted draft; arbitrary initials still permit exact spelling.

4. **Port correction and phrase branches.** Add locked-word spelling, constrained span refinement, demo completion, candidate branch history, Back, and atomic Undo. Reseed Dasher on every external target change. Gate: reject every phrase, spell a keyword, choose a better phrase, replace one word with an uncommon name, and undo while preserving all unrelated text and punctuation.

5. **Finish interaction safety and experiment controls.** Exercise mouse/synthetic dwell, stale samples, tracking loss, window blur/resize, delayed results, and Strict Mode mount/cleanup. Add a small paused-only experiment panel for split preset, steering speed, dwell duration, and uniform/PPM literal weighting. Record condition IDs and timings without raw text. Gate: reproducible offline session with no unintended insertion, candidate acceptance, or speech; record measured latency and remaining hardware/provider limitations.

Every gate ends in a usable integrated workspace. Do not work through a full engine translation and a full UI rewrite in isolation before connecting them. No estimated dates are attached before the engine parity spike; the highest-uncertainty work is reversible output/seeding and safe branch updates, not renaming `.js` files.

## 8. Engine prediction and performance rules

Keep per-frame navigation synchronous over cached weights. Do not await inference or train a corpus inside the animation callback. Prepare PPM training/distributions in a worker when they would block the renderer; a bounded authored fixture and precomputed/cached branch results are sufficient initially. Workers return revision/session-tagged data, not references to mutable engine nodes.

For every supported symbol, validate a finite nonnegative probability, exclude the root sentinel, normalize, and mix in a documented positive uniform floor, for example `p' = 0.95 × p + 0.05 / alphabetSize`. Test actual low-probability reachability as well as mathematical positivity. Invalid distributions retain the usable baseline and surface a status; they never empty the alphabet. This baseline is a core exact-entry capability.

Stage new branch weights and activate them only while paused or when constructing an unentered future branch. Never resize the region currently being pursued because a prediction resolved. Preserve the inherited weights for an active branch. Keep next-character and next-word-initial experiments separate and named; a future LLM token distribution requires its own documented conversion.

Bound visible SVG nodes/tree depth and measure retained nodes after long entry and repeated reversal. Verify that changing the upper candidate set does not remount Dasher. Use [effect cleanup](https://react.dev/reference/react/useEffect) to cancel animation, remove listeners, disconnect resize observers, and invalidate pending callbacks; development Strict Mode must not produce duplicate engines.

## 9. Validation and definition of done

| Test layer               | Required evidence                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pure composition tests   | Distinct initials/literal buffers; keyword locking; accept/reject/back/undo; immutable surrounding text; revision increases on undo; old-session output rejection.                                                       |
| Engine trace tests       | Fixed viewport and timestamped pointer traces produce expected output; reverse across a promoted root; replay a seeded segment; pause stops updates; resize preserves text; every supported character remains reachable. |
| Predictor tests          | Complete alphabet coverage including final vocabulary symbol; valid probability mass; empty/invalid distributions; bounded context; stale branch results; no mid-steering reweighting.                                   |
| Request/controller tests | Cancel, retry, out-of-order responses, wrong revision/purpose, malformed candidates, incompatible initials/locked words, and late responses after undo or mode change.                                                   |
| React interaction tests  | Dasher output appears in the upper input view; acceptance updates only its captured destination; cancel refinement keeps the draft; duplicate activation has no second effect.                                           |
| Synthetic input tests    | Loss mid-dwell and steering cancels selection; recovery requires Resume; new content/geometry never inherits dwell; panel crossing pauses steering.                                                                      |
| Running Electron checks  | Full `iwac` loop, rejected choices, spelling an unusual name, error recovery, repeated mount/unmount, light/dark themes, both planned viewport sizes, readable full candidates, and keyboard access.                     |

Run the targeted behavior suite plus `rtk npm run lint`, `rtk npm run typecheck`, and `rtk npm run build`. Use `rtk npm run dev` for the integrated Electron verification. Source manifest instructions should identify the actual test command added during implementation. The original JS reference is a static browser app; SpeakFaster's reference uses its Angular CLI scripts. Neither upstream application becomes a build dependency of SpeakEasy.

Record p95 input-to-visible-update latency against the PRD's provisional 50 ms goal on the development machine, together with frame timing, visible node count, and scenario settings. Synthetic generation delay is a test parameter, not evidence for the PRD's real-model latency target. Compare uniform and PPM under the same trace/tasks. Do not claim full PRD completion, speech capability, live inference, or actual gaze validation from these checks.

The milestone is complete when both typed ports participate in one offline composition loop, both panels share a theme and authoritative state, correction/reversal and error recovery work, and a real provider can replace the demo through the existing contract without changing the composition components.

## 10. Main risks and decisions

- **Retired JS upstream:** this plan deliberately takes ownership of a small pinned source fork to meet the TypeScript requirement. Preserve provenance and validate engine behavior locally. If the engine parity gate fails, record the failure and revisit the source choice before expanding the UI; do not silently ship WASM instead.
- **SVG load:** the upstream migration assessment flags rendering coupling. Extract the renderer, bound visible work, and measure the port. A canvas rewrite requires evidence from the parity/performance gate and an explicit plan revision, not a second speculative implementation.
- **Cross-component edits:** the session boundary, captured destination, and monotonic revision are essential. Without them, reverse navigation or a late prediction can overwrite accepted text.
- **Vertical space:** four candidates compete with navigation height. The paused split presets and viewport gate make this measurable without moving targets during interaction.
- **Demo completeness:** fixtures prove the interaction and provider boundary only. Keep no-result paths usable and label all suggestions; do not infer model quality or research-equivalent performance.
