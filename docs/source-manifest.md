# Port source manifest

## Dasher

Repository: https://github.com/dasher-project/dasher-web

Pinned JavaScript revision: `3e7854f0fbd543f241472e328d55845087a1cb3b`, resolved from the `legacy-js-demo` tag. The current upstream default branch uses C++/WebAssembly; the preserved JS version is retired upstream.

| Original source                                                                                      | Local adaptation                                  | Modifications                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser/dasher/limits.js`                                                                           | `src/renderer/src/features/dasher/geometry.ts`    | Typed adaptation of the upstream target-right piecewise height/leading-edge gradients; uses the full panel, moves small previews farther right, separates 4px spawning from 10px drawing, and retains normalized zoom during resize.                                                                                                                                                                                                                       |
| `browser/dasher/zoombox.js`, `controllerpointer.js`, `palette.js`, render loop in `userinterface.js` | `src/renderer/src/features/dasher/engine.ts`      | Compact typed model/controller adaptation; continuous displacement-controlled camera zoom and affine ancestor congruence; in-place resize and pause/resume; compact reversible ancestry; direct character choices; bounded visible tree; immutable per-branch weights; output snapshots and explicit input limits. This is a rewrite of these selected mechanics, not a mechanical line-for-line translation of all upstream classes.                      |
| `browser/dasher/viewer.js`                                                                           | `src/renderer/src/features/dasher/SvgRenderer.ts` | Rewritten typed SVG view with right-extending nested rectangles, separate upper label layer, stable path-based colors, bounded node reuse, theme tokens, and isolated React-owned host.                                                                                                                                                                                                                                                                    |
| `browser/dasher/third_party/jslm/ppm_language_model.js`, `vocabulary.js`, `predictor_ppm.js` adapter | `src/renderer/src/features/dasher/prediction.ts`  | Typed PPM suffix/backoff mechanics and interpolation; map-based vocabulary; bounded authored fixture; precomputed contexts; positive mass for every supported symbol. Initials now use the shared word-initial PPM logic on authored demo sentence initials, separately from literal-character PPM; the offline AAC/Turk research artifact is not the bundled demo model. Logging, book imports, global model instances, and alternate predictors removed. |

The JS navigation files are MIT. The Google Research PPM/vocabulary sources are Apache-2.0; the MIT wrapper does not supersede that license. Full licenses are in `licenses/`. No C++/WASM engine, upstream vendor bundle, or external book corpus is imported.

## SpeakFaster

Repository: https://github.com/TeamGleason/SpeakFaster

Pinned revision: `fb80a71fe846b03cad48654b76e4ff039aee475f`.

| Original source under `webui/src/`                                          | Local adaptation                                                    | Modifications                                                                                                                                                                             |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/abbreviation/`, `app/input-bar/`, `app/input-bar-chip/`, `app/phrase/` | `features/speakfaster/SpeakFasterPanel.tsx`, `composition/model.ts` | React behavior rewrite, shared reducer, explicit acceptance, initials/locked tokens, exact spelling, undo and phrase branches. No Angular, RxJS, host key injection, or speech shortcuts. |
| `app/abbreviation-refinement/`, `app/input-text-predictions/`               | Phrase panel, shared prediction contract and `prediction/demo.ts`   | Selected-range refinement and completion with demo fixtures; surrounding text preserved; cancel keeps original text.                                                                      |
| `app/types/abbreviation.ts`, `app/speakfaster-service.ts`                   | `src/shared/prediction.ts`, `prediction/usePredictions.ts`          | Typed purpose/request/revision contract with cancellation, result validation, and stable IDs. No old/new endpoint compatibility, account APIs, original research model, or cloud calls.   |

The [behavior map](./speakfaster-translation.md) traces the translation to pinned TypeScript handlers, templates, and upstream unit tests. The active abbreviation or phrase chip receives Dasher output directly. Candidate editing remains separate from acceptance; selecting a phrase word requests same-initial FillMask alternatives; exact spelling and cancellation operate without generation. Prefixes, locked words, punctuation, and prior branches are preserved. Explicit Edit/Use controls replace upstream's implicit two-activation candidate gesture.

[The paper, section 2](https://arxiv.org/html/2312.01532v1#S2), distinguishes initials expansion, KeywordAE (including partial keywords), and same-initial FillMask. This milestone adapts those editing paths with project-authored fixtures. Expansion runs after steering pauses or an explicit Expand action, and arriving results wait for dwell to clear. Four candidates follow the SpeakEasy PRD. The research models, per-keystroke calls, and automatic speaking on selection are not included; phrase acceptance never authorizes speech.

SpeakFaster's source is MIT; the full license is in `licenses/speakfaster-MIT.txt`. No image assets or platform research tooling is copied.

## Build and verification

Run from the SpeakEasy repository:

```sh
rtk npm install
rtk npm test
rtk npm run lint
rtk npm run typecheck
rtk npm run build
```

The original JS reference is a static browser application; SpeakFaster's reference uses Angular CLI. Neither upstream app is a dependency of the local build. Runtime privileged access is absent from this offline milestone; a future provider must add a narrow validated main/preload operation rather than exposing arbitrary IPC.

Tests exercise local engine traces, state transitions, constraints, cancellation, and React interactions. They do not prove real gaze tracking, parity with all upstream behavior, or real LLM/speech performance.
