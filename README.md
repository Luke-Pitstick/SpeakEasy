# SpeakEasy

An Electron desktop app with React, TypeScript, and Vite, scaffolded with the official [electron-vite starter](https://electron-vite.org/guide).

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
- `src/preload/index.ts`: The bridge between Electron and the React renderer.
- `src/renderer/src/App.tsx`: Gaze test screen — tiles light up as you look at them.
- `src/renderer/src/eyetracking/`: Webcam eye tracking (see below).
- `src/renderer/src/assets/`: UI styles and images.
- `electron.vite.config.ts`: Build configuration for all three processes.
- `electron-builder.yml`: App identity and packaging configuration.

Keep filesystem access and other native work in the main process, and expose specific operations through preload as the app grows.

## Eye tracking

Gaze is estimated from the webcam with MediaPipe's face landmarker (iris landmarks + head pose), fully offline. The WASM runtime and model are placed in `src/renderer/public/mediapipe/` by `npm install` (git-ignored).

1. `WebcamFaceSource` turns each camera frame into iris offsets within each eye plus the head's 3D pose (MediaPipe's facial transformation matrix).
2. `gazeModel.ts` is a two-stage model, chosen by benchmarking candidates on real exported calibration data. Stage 1 maps eye measurements (each eye's iris offset and eyelid opening, which narrows when looking down, where the lid also hides the iris's movement) to the screen, trained only on still-head samples. Stage 2 corrects for head movement from the change in head pose since calibration; it has no constant term, so it is zero at the calibration pose and can't disturb still-head precision. A geometric model (eye ray rotated by head pose) was about twice as inaccurate on real data: MediaPipe's head pose shifts 1–2° as the eyes move, and geometry trusts it fully. Both stages are closed-form, so fitting takes milliseconds, and saved calibration samples are refit automatically when the model changes.
3. Calibration has three phases: 11 points with the head still in your normal posture (two extra in the lower half); guided head moves (turn, tilt, lean, slide) while looking at a dot, each shown with a live progress bar and recorded only while the pose is held; then 4 held-out points to measure accuracy. It is saved in `localStorage` and reused on next launch.
4. `GazeTracker` applies the model, smooths with a One Euro filter, holds position during blinks, and emits `GazePoint`s in window coordinates. The panel's head guide shows where your head is compared with the calibration position.
5. Aim assist (`aimAssist.ts`): every visible element with a `data-gaze-target="<id>"` attribute is eye-clickable. Gaze within 90px of one locks onto it (with stickiness so noise near edges doesn't flicker) and is pulled toward its centre. `GazePoint.target` holds the locked id, and `rawX`/`rawY` the unassisted gaze. Toggle and tune it from the panel or `tracker.setAimAssist({ enabled, strength, radius })`.
6. Learning from clicks (off by default; enable in the panel): after calibrating, each left click is taken as "I was looking here". Eye frames from 350 ms before to 100 ms after the click become extra calibration samples (weighted 30× a calibration frame, newest 60 clicks kept) and the screen mapping is refitted in a few ms. Clicks the model places more than 300 px away are ignored. Calibration samples and clicks are stored in `localStorage` so learning carries over between launches. `tracker.refineFromClick(x, y)` does the same programmatically, e.g. on gaze-dwell selection.
7. Dwell selection (`dwell.ts`): look at a `data-gaze-target` element for 1 s (adjustable) to select it. The gaze dot fills with a ring, and the element gets a `--gaze-dwell` (0–1) CSS variable for its own progress UI. Short blinks and tracking flickers pause rather than reset; after a selection you must look away before selecting the same target again. Selection fires `tracker.onSelect` / `useGazeSelect`, a bubbling `gazeselect` event on the element, and `element.click()` (opt out with `data-gaze-click="false"`).
8. Learning from selections (`selectionLearning.ts`, off by default): each dwell selection is treated as "I was looking at that target's centre" and learned from, with safeguards: the gaze must have been steady, clearly closer to the selected target than to any other, and the learning waits 2 s before applying. **Apps must call `tracker.cancelPendingLearning()` when the user undoes a selection** (the demo uses Esc). Selecting a neighbouring target within those 2 s also cancels it. Selection frames weigh 10× a calibration frame (less for big targets, where "the centre" is vaguer), versus 30× for clicks. In simulation, with a 75 px drift and users undoing mistakes, error fell to ~20 px within 60 selections. If mistakes are never undone, learning can reinforce the drift instead; use "Forget learning" in the panel to reset. Both kinds of learning also go wrong when a bias makes you over-aim (e.g. looking at the keyboard to reach the bottom row), because they then learn the over-aim, which is why they are off by default.
9. Exporting: "Export data" in the panel saves the calibration samples (eye and head measurements tagged by calibration phase, no images), the model, and screen geometry as JSON, for re-fitting and comparing models offline.

### Head pointing (opt-in)

Head pointing is an alternative to eye gaze, off by default. To enable it, run `localStorage.setItem('speakeasy.headPointer', 'on')` in DevTools (F12) and reload; set it to anything else (or remove it) to turn it off. The panel then shows a **Pointer: eyes / head** toggle. In head mode (`headPointer.ts`) the pointer follows where your face points, using MediaPipe's head turn and tilt (about 6×13 px of jitter after smoothing, versus 150 px+ error for webcam eye gaze). It needs no calibration, only centring: point your nose at a dot for 2 s, which happens automatically the first time you switch each session (or click **Center**). At sensitivity 1×, ±10° of turn spans the width and ±7° of tilt the height. Pushing past an edge shifts the centre along with you ("edge push"), so posture drift doesn't strand the pointer. Aim assist and dwell selection work the same in both modes; learning from clicks and selections only applies to eye mode.

In React, wrap the app in `<GazeProvider>` and use `useGaze()`, `useGazeTarget()` (the `data-gaze-target` id being looked at, after aim assist), or `useGazeTracker().onGaze(...)` for per-frame updates without re-rendering.

On macOS, the terminal or app that launches Electron needs camera permission (System Settings › Privacy & Security › Camera).
