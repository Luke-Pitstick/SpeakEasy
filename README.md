# SpeakEasy

An offline Electron/React/TypeScript composition experiment combining a Dasher-derived continuous letter stream with SpeakFaster-derived initials expansion and word refinement. Both panels share one composition state and a flat neutral theme.

## Try the composition loop

Enter `iwac` in the Initials field and select Expand, or use Menu → Load demo initials. Select a phrase to accept it into your message; select one word in the message to spell or suggest a replacement. Undo restores the previous edit. Menu contains Undo, Delete, exact spelling, initials editing, previous phrase, a new message, and settings.

Click anywhere in Dasher to start steering, then click again to pause. Space or Enter works when Dasher has keyboard focus. Move right toward a letter to zoom into it; move left to reverse. A pointer ring, center vector, and distance readout show steering displacement. Nested boxes use the upstream piecewise height-to-position projection across the whole panel. A continuous camera transform keeps zoom smooth across characters; pausing and resuming retains that view. Resizing scales the current boxes without resetting the branch. The phrase area contracts during entry to give Dasher more height. Leaving the surface, Escape, focus loss, or resizing pauses steering. Dwell selection is optional under Menu → Settings. A physical eye tracker is not connected.

Suggestions use a small set of authored demo fixtures, including `iwac`, `insw`, `cyhm`, and `tysm`. Unknown initials return no match while exact spelling remains available. No LLM, cloud service, microphone, or speech provider is connected. Selecting a phrase does not speak it.

See [interface references](docs/interface-references.md), [source mappings](docs/source-manifest.md), and [attribution](THIRD_PARTY_NOTICES.md). The current engine is a source-derived adaptation; tests do not establish parity with every upstream Dasher behavior or real gaze usability.

## Development

Use Node.js 24 LTS and npm.

```sh
npm install
npm run dev
```

The development command opens Electron and enables hot reload for the React UI. Press F12 to toggle DevTools.

## Commands

| Command                | Purpose                                   |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Start the app in development mode         |
| `npm run lint`         | Check the source with ESLint              |
| `npm test`             | Run navigation, composition, and UI tests |
| `npm run typecheck`    | Check TypeScript across all processes     |
| `npm run format`       | Format the project with Prettier          |
| `npm run build`        | Typecheck and build into `out/`           |
| `npm start`            | Open the production build after building  |
| `npm run build:unpack` | Build an unpacked desktop app in `dist/`  |
| `npm run build:mac`    | Build a macOS distribution                |
| `npm run build:win`    | Build a Windows installer                 |
| `npm run build:linux`  | Build Linux distributions                 |

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
- `src/renderer/src/assets/`: UI styles and images.
- `electron.vite.config.ts`: Build configuration for all three processes.
- `electron-builder.yml`: App identity and packaging configuration.

Keep filesystem access and other native work in the main process, and expose specific operations through preload as the app grows.
