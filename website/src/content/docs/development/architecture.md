---
title: Architecture
description: How SpeakEasy's Electron processes, composition state, local predictors, memory stores, and voice path fit together.
sidebar:
  order: 1
---

SpeakEasy is an Electron desktop app with a React and TypeScript interface. This page describes the code as it exists in the repository today. The [technical overview](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/docs/technical-overview.md) and the focused documents under `docs/` go deeper on each part.

## Product invariants

These rules shape every part of the code. A change that breaks one of them is a bug, even if every test passes.

- **The user owns the message.** Suggested phrases, replacements, and tone suggestions are proposals. They change the message only when you select them, and you can edit or reject them.
- **Nothing is spoken without an explicit Speak or Preview.** Selecting a phrase, receiving a suggestion, or locking a sentence never triggers speech. The speech request records whether it came from `speak` or `preview`, and the main process rejects anything else.
- **Exact spelling works without any model.** Steering, exact spelling, correction, and undo use only local code. They keep working with no network, no credentials, and generation turned off.
- **Tracking loss pauses input without discarding the draft.** When gaze tracking is lost, writing pauses and pending selection is cancelled. The draft stays in place, and resuming is a deliberate action.
- **Model output is data, not instructions.** Responses cannot edit accepted text, run application actions, or start speech. They are validated and then applied through explicit application events, or dropped.
- **Cloud features are separate and opt-in.** Generation, tone suggestions, and speech each have their own credentials and settings. Local features never fall back to a cloud provider silently.

## The three processes

| Process  | Entry point              | What it owns                                                                                                                                                                                                                                      |
| -------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main     | `src/main/index.ts`      | Window lifecycle, camera and microphone permission checks, credentials, SQLite databases, settings files, and every provider connection (OpenRouter, Moss, Cartesia, Jev).                                                                        |
| Preload  | `src/preload/index.ts`   | A narrow typed bridge. It exposes seven objects on `window`: `preferences`, `memory`, `settings`, `gemini`, `voice`, `tone`, and `diagnostics`. Each method maps to one named IPC channel. There is no generic IPC, filesystem, or shell bridge. |
| Renderer | `src/renderer/src/main.tsx` | The React interface, the Dasher engine and its local PPM predictors, the composition reducer, webcam gaze and head-pointer tracking, dwell, microphone capture, and Web Audio playback.                                                    |

The main window runs with `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`. New windows are denied and in-page navigation is blocked. IPC handlers in the main process check that each call comes from the main window's own top-level frame and validate the payload before acting on it. Credentials never reach the renderer.

Types and validators shared across processes live in `src/shared/`. Zod schemas and hand-written guards there validate prediction requests, conversation history, memory and preference operations, tone requests, and speech requests at the IPC boundary.

## Composition flow

One reducer in `src/renderer/src/composition/model.ts` owns the composition state. It holds the accepted draft, the token list of initials, prefixes, locked words and punctuation, locked sentences, the current mode, the pending prediction request, the displayed candidates, undo history, phrase branches, and a `revision` number that increases on every change.

A typical message goes through these steps:

1. **Enter initials.** You steer through the Dasher panel (`src/renderer/src/features/dasher/`). Each letter you pass becomes an initial token. Locked words and prefixes stay fixed while the trailing initials remain reversible.
2. **Retrieve context.** When steering pauses, or you choose **Show phrases**, the renderer builds a `PredictionRequest` with a request ID, the current revision, a purpose (`expansion`, `refinement`, or `completion`), the tokens, locked text, and recent conversation turns. The main process searches earlier conversation turns and permitted saved facts through Moss, resolves the topic with a context model call, and retrieves matching corrections and saved phrases from local storage.
3. **Generate candidates.** `src/main/gemini.ts` streams up to six phrases from OpenRouter. The default model is `google/gemini-3.8-flash`, with low reasoning effort and reasoning excluded from the returned text. A phrase cache can return familiar phrases immediately. Each candidate is checked against the initials, prefixes, and locked words before it is shown.
4. **Select or edit.** In the phrase panel (`src/renderer/src/features/speakfaster/`) you choose a candidate to review. You can change a single word through same-initial replacements, spell a word yourself, or switch to exact spelling. Nothing is accepted until you select it.
5. **Speak.** Selecting **Speak** sends an immutable snapshot of the confirmed text, voice, speed, and tone to the main process. Later edits cannot change that utterance.

If generation is off or unconfigured, the request returns cached phrases or an explicit error state, and steering and exact spelling keep working.

## Rejecting stale responses

Asynchronous results can arrive after the message has changed. SpeakEasy handles this in two layers.

- **Cancellation.** Starting a new request cancels the previous one in the main process, and the renderer sends `gemini:cancel` when a request is superseded.
- **Identity checks.** Cancellation alone cannot stop a response that is already in flight, so the renderer applies a result only when its `requestId` and `revision` both match the pending request (`src/renderer/src/prediction/usePredictions.ts`). A response is never applied to a different draft because its text looks plausible.

Tone suggestions use the same pattern with request IDs, composition revisions, and a `contextEpoch` that increases when you clear the conversation. Results also wait until input is paused and no dwell is in progress, so the screen does not change under your gaze.

## Local PPM predictors

Dasher sizes each letter region by its predicted probability. Two local predictors run synchronously in the renderer, with no network call during steering.

- **Initials PPM.** A frozen table of next-initial probabilities, bundled as `src/renderer/src/features/dasher/initials-model.json`. It uses at most two preceding initials and 10% uniform smoothing, so every letter keeps a positive probability. It was trained only on the AAC training split of a CC BY 4.0 corpus, and an automated test checks its SHA-256. The estimator lives in `src/shared/initialsPpm.ts`, and `npm run ppm` (`scripts/initials-ppm/`) rebuilds and evaluates it.
- **Character PPM.** Exact spelling uses a separate literal-character PPM with up to four preceding characters, trained on a small authored fixture (`src/renderer/src/features/dasher/prediction.ts`).

Neither predictor learns from your messages. You can switch the initials condition to **Uniform** in **Menu → Settings → Letter prediction**. See [initials PPM integration](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/docs/initials-ppm-integration.md) for provenance and test results.

## Memory and local storage

All persistent data lives in Electron's `userData` directory. The main process owns every store.

| File                  | Owner                                            | Contents                                                                                                                                   |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `preferences.sqlite`  | `preferenceStore.ts`, `preferenceService.ts`     | Personal memory: confirmed sentences and facts extracted from them, with provenance. Extraction jobs are saved before the network call.     |
| `memory.sqlite`       | `memory.ts`                                      | Correction memory: explicitly accepted wording corrections and vocabulary, retrieved by lexical match.                                    |
| `phrase-cache.json`   | `phraseCache.ts`                                 | Saved phrases that can be reused without regenerating them.                                                                                |
| `settings.json`       | `settings.ts`                                    | App settings, including the generation and Jev permissions.                                                                                |
| `voice-settings.json` | `cartesiaIpc.ts`                                 | Voice, speed, volume, tone, and microphone choices.                                                                                        |

Both databases use Node's built-in `node:sqlite`. Moss (`mossMemory.ts`) builds two disposable in-memory search sessions, one for conversation turns and one for permitted facts. Those indexes are not written to disk. The renderer keeps up to 500 finalized conversation turns for the session only. Diagnostics traces are opt-in, bounded, held in memory, and never written to disk.

Edits and deletions invalidate dependent retrieval state and pending generations. If a database cannot open, composition keeps working without personalization. See [privacy and data](../../privacy/data/) for what each provider receives.

## Voice path

`src/main/cartesia.ts` and `src/main/cartesiaIpc.ts` wrap the Cartesia SDK. The renderer side is `src/renderer/src/features/voice/`.

- **Speech.** A `voice:speak` call carries an utterance ID, the exact text, voice settings, a supported tone, and its origin (`speak` or `preview`). The main process rejects invalid requests, text containing angle brackets (which Cartesia would treat as control markup), and a second request while one is active. It streams `sonic-3.6` audio as 24 kHz float PCM to the renderer, which queues it in Web Audio. **Stop** aborts generation and playback, and late chunks for a stopped utterance are ignored. Speech requests never retry automatically.
- **Tone.** Neutral is sent explicitly. Optional Jev suggestions (`src/main/jev.ts`) choose one of neutral, calm, happy, excited, or sad. The tone control beside **Speak** shows the selected tone, and a manual choice always wins.
- **Transcription.** With a key and microphone permission, an AudioWorklet filters audio through local RNNoise and streams 100 ms PCM blocks to `ink-2`. Final transcripts become partner turns in the conversation. Transmission pauses during playback so the app does not transcribe itself.

## Where things live

| Path                                    | Responsibility                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/main/`                             | Electron lifecycle, IPC handlers, credentials, SQLite stores, settings, and provider clients.  |
| `src/preload/`                          | The typed `contextBridge` API and its type declarations.                                       |
| `src/shared/`                           | Serializable contracts and validation shared by main and renderer, plus the initials estimator. |
| `src/renderer/src/composition/`         | The composition reducer, state, and React context.                                             |
| `src/renderer/src/features/dasher/`     | Dasher engine, geometry, SVG renderer, and both PPM predictors.                                |
| `src/renderer/src/features/speakfaster/` | Phrase review, word replacement, and refinement panel.                                        |
| `src/renderer/src/features/voice/`      | Voice settings, microphone capture, playback, and tone hooks.                                  |
| `src/renderer/src/features/gaze/`       | Gaze settings and the layer that pauses writing when tracking is lost.                          |
| `src/renderer/src/eyetracking/`         | Webcam gaze and head-pointer tracking with MediaPipe, calibration, filtering, and dwell.       |
| `src/renderer/src/interaction/`         | Dwell selection and shared gaze-friendly controls.                                             |
| `src/renderer/src/prediction/`          | Prediction requests, conversation, memory and preference panels, and the debug window.         |
| `scripts/`                              | Eye-tracking asset preparation and the initials PPM training and evaluation CLI.               |
| `tests/`                                | Vitest unit, integration, and React interaction tests.                                         |
| `licenses/`, `resources/licenses/`      | Third-party license texts. The second folder ships inside packaged builds.                     |

To build and run the app, continue with [building from source](../building/).
