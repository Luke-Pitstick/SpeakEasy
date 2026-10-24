# SpeakEasy

An offline Electron/React/TypeScript composition experiment combining a Dasher-derived continuous letter stream with SpeakFaster-derived initials expansion and word refinement. Both panels share one composition state and a flat neutral theme.

## Try the composition loop

Enter `iwac` in the Initials field and select Expand, or use Menu → Load demo initials. Select a phrase to accept it into your message; select one word in the message to spell or suggest a replacement. Undo restores the previous edit. Menu contains Undo, Delete, exact spelling, initials editing, previous phrase, a new message, and settings.

Click anywhere in Dasher to start steering, then click again to pause. Space or Enter works when Dasher has keyboard focus. Move right toward a letter to zoom into it; move left to reverse. A pointer ring, center vector, and distance readout show steering displacement. Nested boxes use the upstream piecewise height-to-position projection across the whole panel. A continuous camera transform keeps zoom smooth across characters; pausing and resuming retains that view. Resizing scales the current boxes without resetting the branch. The phrase area contracts during entry to give Dasher more height. Leaving the surface, Escape, focus loss, or resizing pauses steering. Dwell selection is optional under Menu → Settings. A webcam eye tracker can drive the same controls (see [Eye tracking](#eye-tracking)); no dedicated eye-tracking hardware is supported.

Suggestions use a small set of authored demo fixtures, including `iwac`, `insw`, `cyhm`, and `tysm`. Unknown initials return no match while exact spelling remains available. No LLM, cloud service, microphone, or speech provider is connected. Selecting a phrase does not speak it.

See [interface references](docs/interface-references.md), [source mappings](docs/source-manifest.md), and [attribution](THIRD_PARTY_NOTICES.md). The current engine is a source-derived adaptation; tests do not establish parity with every upstream Dasher behavior or real gaze usability.

The offline initials-prediction experiment is documented in [datasets and techniques](docs/datasets-and-techniques.md), including source provenance, preprocessing, PPM selection, and links to saved results.

## Development

Use Node.js 24 LTS and npm.

```sh
npm install
npm run dev
```

The development command opens Electron and enables hot reload for the React UI. Press F12 to toggle DevTools.

## Commands

| Command                       | Purpose                                                     |
| ----------------------------- | ----------------------------------------------------------- |
| `npm run dev`                 | Start the app in development mode                           |
| `npm run assets:eye-tracking` | Re-copy MediaPipe WASM and the face model (runs on install) |
| `npm run lint`                | Check the source with ESLint                                |
| `npm test`                    | Run navigation, composition, and UI tests                   |
| `npm run typecheck`           | Check TypeScript across all processes                       |
| `npm run format`              | Format the project with Prettier                            |
| `npm run build`               | Typecheck and build into `out/`                             |
| `npm start`                   | Open the production build after building                    |
| `npm run build:unpack`        | Build an unpacked desktop app in `dist/`                    |
| `npm run build:mac`           | Build a macOS distribution                                  |
| `npm run build:win`           | Build a Windows installer                                   |
| `npm run build:linux`         | Build Linux distributions                                   |

Build platform distributions on their corresponding operating systems. macOS signing and notarization need configuration before public distribution.

## Source layout

- `src/main/index.ts`: Electron lifecycle and native window management.
- `src/preload/index.ts`: Currently exposes no privileged operations.
- `src/renderer/src/App.tsx`: The stacked communication workspace and secondary settings.
- `src/renderer/src/composition/`: Authoritative composition reducer, revisions, entry sessions, and undo.
- `src/renderer/src/features/dasher/`: Navigation, SVG rendering, and cached PPM/uniform distributions.
- `src/renderer/src/features/speakfaster/`: Phrase selection and contextual correction.
- `src/renderer/src/prediction/`: Async demo generator, validation, cancellation, and stale-result handling.
- `src/shared/prediction.ts`: Serializable prediction contract for a future provider.
- `src/renderer/src/eyetracking/`: Webcam eye tracking and the gaze-to-pointer bridge (see below).
- `src/renderer/src/assets/`: UI styles and images.
- `electron.vite.config.ts`: Build configuration for all three processes.
- `electron-builder.yml`: App identity and packaging configuration.

Keep filesystem access and other native work in the main process, and expose specific operations through preload as the app grows.

## Eye tracking

Choose **Menu → Settings → Input → Eye tracker (webcam)**, then **Calibrate eye tracker**. Once calibrated, your gaze drives the workspace exactly as the mouse does: `gazePointerBridge.ts` turns each gaze sample into the pointer events a mouse would produce (enter/leave as the element under your gaze changes, and a move every frame), so the existing dwell buttons, top-edge switch and Dasher steering work unchanged. While gaze drives the pointer, the real mouse's hover is ignored (clicks still work), and losing your face cancels pending dwell and pauses writing. Settings also has a **Pointer dot** toggle; the input choice is remembered, and the camera only runs while an eye or head input is selected.

Gaze is estimated from the webcam with MediaPipe's face landmarker, fully offline. The WASM runtime and model are placed in `src/renderer/public/mediapipe/` by `npm install` (git-ignored).

1. `WebcamFaceSource` turns each camera frame into iris offsets and eyelid opening for each eye, plus the head's 3D pose (MediaPipe's facial transformation matrix).
2. `gazeModel.ts` is a two-stage model, chosen by benchmarking candidates on real exported calibration data. Stage 1 maps eye measurements to the screen, trained only on still-head samples; stage 2 corrects for head movement from the change in head pose since calibration and is zero at the calibration pose.
3. Calibration has three phases: 11 points with the head still in your normal posture; guided head moves (turn, tilt, lean, slide) while looking at a dot, each with a live progress bar; then held-out points to measure accuracy. It is saved in `localStorage`.
4. `GazeTracker` applies the model, smooths with a One Euro filter, and holds position during blinks.

Measured accuracy on real data is roughly 80–200 px (about 1.5–4° of gaze), and the estimate shifts when posture changes after calibration, so large targets work best. The tracker also contains experimental pieces not exposed in the UI: aim assist, its own dwell selector, learning from clicks/selections (both off), and calibration export/drift-test diagnostics.

### Head pointing (opt-in)

Head pointing is an alternative to eye gaze, off by default. To enable it, run `localStorage.setItem('speakeasy.headPointer', 'on')` in DevTools (F12) and reload; Settings → Input then offers **Head pointer (webcam)**. The pointer follows where your face points (MediaPipe's head turn and tilt; about 6×13 px of jitter after smoothing). It needs no calibration, only centring: point your nose at a dot for 2 s, which happens automatically the first time each session (or use **Center head pointer**). At standard sensitivity, ±10° of turn spans the width and ±7° of tilt the height; pushing past an edge shifts the centre along with you.

In React, the app is wrapped in `<GazeProvider active>`; use `useGazeTracker().onGaze(...)` for per-frame gaze without re-rendering, or `useTrackerState()` for status.

On macOS, the terminal or app that launches Electron needs camera permission (System Settings › Privacy & Security › Camera).
