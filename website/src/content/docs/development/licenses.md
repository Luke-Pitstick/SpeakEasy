---
title: Licenses and credits
description: SpeakEasy's GPL-3.0-only license and the third-party code, data, and libraries it adapts or ships with.
sidebar:
  order: 6
---

## SpeakEasy

SpeakEasy is free software licensed under the [GNU General Public License, version 3 only](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/LICENSE) (`GPL-3.0-only`). Every source file carries an SPDX header with that identifier. The license includes a warranty disclaimer: the software comes with no warranty.

## Adapted source and bundled data

SpeakEasy contains modified TypeScript adaptations of selected Dasher and SpeakFaster source. These are local rewrites of specific mechanics, not copies of the complete upstream applications, and they have not been shown to match all upstream behavior. The [source manifest](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/docs/source-manifest.md) records pinned revisions and every modification, and [THIRD_PARTY_NOTICES.md](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/THIRD_PARTY_NOTICES.md) ships inside packaged builds.

| Component                    | Upstream                                                                                                    | License       | What SpeakEasy adapted                                                                                                                                                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dasher JavaScript navigation | [dasher-project/dasher-web](https://github.com/dasher-project/dasher-web), revision `3e7854f` (`legacy-js-demo` tag). Copyright 2020 The ACE Centre-North. | [MIT](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/licenses/dasher-MIT.txt) | Typed rewrites of the zoom geometry (`limits.js`), the zoom box, pointer controller, palette and render loop, and the SVG viewer. Adds continuous displacement-controlled zoom, reversible ancestry, pause and resume, in-place resize, and frozen per-branch weights. No C++ or WebAssembly engine is imported. |
| jslm PPM algorithm           | `browser/dasher/third_party/jslm/` in the same Dasher revision. Copyright 2020 The Google Research Authors. | [Apache-2.0](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/licenses/jslm-Apache-2.0.txt) | Typed PPM suffix, backoff, and interpolation mechanics with a map-based vocabulary and positive mass for every supported symbol. The word-initial estimator in `src/shared/initialsPpm.ts` applies the same probability rule to word initials. Logging, book imports, and alternate predictors were removed. No upstream weights or training books are included. |
| SpeakFaster composition      | [TeamGleason/SpeakFaster](https://github.com/TeamGleason/SpeakFaster), revision `fb80a71`. Copyright 2021 TeamGleason. | [MIT](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/licenses/speakfaster-MIT.txt) | A React rewrite of abbreviation expansion, phrase chips, word refinement, and the typed prediction request contract from the Angular `webui`. No Angular, RxJS, account APIs, original research models, or image assets are copied. |
| Initials PPM model           | Trained by SpeakEasy from `sent_train_aac.txt` in Keith Vertanen and Per Ola Kristensson's [*A Crowdsourced Corpus of AAC-like Communications*](https://aactext.org/imagine/). | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `src/renderer/src/features/dasher/initials-model.json` contains smoothed next-initial probability tables derived from each message's word initials. The source text is not bundled. See [initials PPM integration](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/docs/initials-ppm-integration.md) for build and provenance. |

The upstream Dasher wrapper is MIT, but that does not change the Apache-2.0 license of the Google Research PPM files inside it. Each license text is kept in [`licenses/`](https://github.com/Luke-Pitstick/SpeakEasy/tree/main/licenses).

The demo phrases and the small character PPM training fixture were written for this project.

## Microphone noise filtering

Microphone audio is filtered locally before transcription. These components are bundled with the app, and their license texts are in [`resources/licenses/`](https://github.com/Luke-Pitstick/SpeakEasy/tree/main/resources/licenses), which ships inside packaged builds.

| Component                                                                         | Version  | License      |
| --------------------------------------------------------------------------------- | -------- | ------------ |
| [`@sapphi-red/web-noise-suppressor`](https://github.com/sapphi-red/web-noise-suppressor) | 0.4.1    | MIT          |
| [`@shiguredo/rnnoise-wasm`](https://github.com/shiguredo/rnnoise-wasm)             | 2022.2.0 | Apache-2.0   |
| [Xiph RNNoise](https://github.com/xiph/rnnoise)                                    | bundled in the WASM build | BSD-3-Clause |

## Runtime libraries

SpeakEasy also depends on these npm packages at runtime. The licenses below are the ones each package declares.

| Package                    | Purpose                                  | Declared license                                  |
| -------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Electron                   | Desktop runtime                          | MIT                                               |
| React, React DOM           | User interface                           | MIT                                               |
| `@mediapipe/tasks-vision`  | Webcam face landmarks for gaze tracking  | Apache-2.0                                        |
| `@cartesia/cartesia-js`    | Speech synthesis and transcription client | Apache-2.0                                       |
| `@moss-js/moss`            | Local hybrid search over conversation and saved facts | PolyForm Shield License 1.0.0           |
| `zod`                      | Runtime validation                       | MIT                                               |
| `ws`                       | WebSocket client                         | MIT                                               |
| `@electron-toolkit/preload`, `@electron-toolkit/utils` | Electron helpers             | MIT                                               |

The MediaPipe face landmarker model (`face_landmarker.task`) is not stored in the repository. `npm ci` downloads it from Google's MediaPipe model storage, as described in [building from source](../building/).

## Thanks

SpeakEasy builds directly on the work of the Dasher project and the ACE Centre, the SpeakFaster authors at TeamGleason, the Google Research authors of jslm, and the authors of the AAC-like communications corpus. Their published code, research, and data made this project possible.
