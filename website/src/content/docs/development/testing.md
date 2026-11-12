---
title: Testing
description: Run lint, type checks, tests, and the build, see what the test suite covers, and learn what manual verification a change needs.
sidebar:
  order: 3
---

SpeakEasy uses ESLint, TypeScript, and Vitest. Run the same checks as CI before you open a pull request.

## Run the checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run build` runs the type check again before building, so a passing build also means the types are clean. To run one file or a few, pass paths to Vitest:

```sh
npm test -- tests/composition.test.ts tests/initials-dasher.test.ts
```

## Where tests live

All tests live in `tests/` and match `tests/**/*.test.{ts,tsx}` (`vitest.config.mts`). Files ending in `.tsx` render React components with Testing Library in jsdom. Provider SDKs and the network are replaced with fakes, so the default suite needs no credentials.

| Area                       | Example files                                                                                                     | What they check                                                                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Composition                | `composition.test.ts`, `suggestion-stability.test.ts`                                                             | Reducer state transitions, locked words and constraints, undo, branches, and stale result rejection.                                           |
| Dasher and PPM             | `engine.test.ts`, `initials-dasher.test.ts`, `initials-dasher-ui.test.tsx`, `initials-ppm.test.ts`, `dasher-offscreen.test.tsx` | Engine traces, frozen branch weights, rare-letter reachability, reversal, the bundled model's SHA-256, and the estimator.        |
| Gaze and dwell             | `dwell-select.test.tsx`, `gaze-pointer-bridge.test.tsx`, `gaze-resume.test.tsx`, `head-pointer.test.ts`, `aim-assist.test.ts`, `webcam-source.test.ts` | Dwell reset, pausing on tracking loss, deliberate resume, and pointer filtering.                                     |
| Phrase review              | `speakfaster-gaze.test.tsx`, `ui.test.tsx`                                                                         | Candidate selection, word replacement, exact spelling, and full-app interaction.                                                               |
| Generation                 | `gemini.test.ts`, `phrase-cache.test.ts`                                                                           | Request validation, candidate validation against initials and locked words, cancellation, and caching.                                          |
| Memory and preferences     | `memory.test.ts`, `memory-ipc.test.ts`, `memory-ui.test.tsx`, `preferences.test.ts`, `preferences-ui.test.tsx`, `moss-memory.test.ts`, `moss-ipc.test.ts` | Storage, retrieval, forgetting and invalidation, IPC validation, and the review panels.              |
| Voice and tone             | `voice.test.ts`, `voice-playback.test.ts`, `voice-context.test.tsx`, `microphone-capture.test.ts`, `microphone-filter.test.ts`, `tone.test.ts`, `tone-ipc.test.ts`, `tone-ui.test.tsx` | Speech authorization, immutable snapshots, Stop and late chunks, RNNoise alignment, and manual tone override. |
| Settings and diagnostics   | `settings.test.ts`, `settings-ipc.test.ts`, `settings-ui.test.tsx`, `camera-preference.test.ts`, `diagnostics.test.ts`, `diagnostics-ipc.test.ts`, `debug-window.test.tsx` | Persistence, sender checks, and opt-in diagnostics.                                                  |

When you change behavior, add or update tests for that behavior. The project prioritizes state transitions, constraint-preserving edits, stale response rejection, tracking-loss behavior, dwell reset, speech authorization, and cancellation. Avoid tests that only restate implementation details.

### Live provider tests

A few tests call real providers. They are skipped unless you set an opt-in variable, and they read credentials from the environment or your local `.env`.

| Variable                         | Test file                                                           |
| -------------------------------- | ------------------------------------------------------------------- |
| `SPEAKEASY_LIVE_QUALITY_TEST=1`  | `gemini-quality-live.test.ts`, `gemini-common-phrases-live.test.ts` |
| `SPEAKEASY_LIVE_SCHOOL_TEST=1`   | `school-context-live.test.ts`                                       |
| `SPEAKEASY_LIVE_MEMORY_TEST=1`   | `preferences-live.test.ts`                                          |
| `SPEAKEASY_JEV_LIVE=1`           | The live case in `tone.test.ts`                                     |

`SPEAKEASY_QUALITY_MODEL` overrides the model used by the quality tests. Live tests send fixed synthetic phrases. Do not put personal conversation into them.

## What CI runs

The **Checks** job in `.github/workflows/ci.yml` runs on Ubuntu with the Node.js version from `.nvmrc`. It runs `npm ci`, `npm run lint`, `npm test`, and `npm run build`. It runs on every pull request into `dev` or `main`, on pushes to `main`, and on version tags. Both branches require **Checks** to pass before merge. On pushes, CI also packages installers, as described in [releases](../releases/).

## Manual verification

Automated tests cannot show that SpeakEasy works for someone using their eyes. For any change to behavior, also run the app with `npm run dev` and try the affected flow yourself.

- **Mouse success does not establish gaze usability.** A flow that works with a mouse can still be unusable with dwell, webcam gaze, or a dedicated eye tracker. If you change targets, layout, dwell, or steering, try the flow with dwell enabled and with a gaze input if you have one.
- **Mock responses do not establish live provider behavior.** Passing tests with faked OpenRouter, Moss, Cartesia, or Jev responses do not show that the real service behaves the same way. If you change a provider integration, test it with real credentials and synthetic phrases.
- **Listen to speech changes.** A successful speech request does not prove the delivery sounds right. Listen to each tone you touch.

In your pull request, say which checks were automated, which were manual with a mouse, which used real gaze, and which reached a live provider. If you could not test something, say so rather than claiming it works.
