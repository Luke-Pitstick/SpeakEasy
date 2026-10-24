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

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the app in development mode        |
| `npm run lint`         | Check the source with ESLint             |
| `npm run typecheck`    | Check TypeScript across all processes    |
| `npm run format`       | Format the project with Prettier         |
| `npm run build`        | Typecheck and build into `out/`          |
| `npm start`            | Open the production build after building |
| `npm run build:unpack` | Build an unpacked desktop app in `dist/` |
| `npm run build:mac`    | Build a macOS distribution               |
| `npm run build:win`    | Build a Windows installer                |
| `npm run build:linux`  | Build Linux distributions                |

Build platform distributions on their corresponding operating systems. macOS signing and notarization need configuration before public distribution.

## Source layout

- `src/main/index.ts`: Electron lifecycle and native window management.
- `src/preload/index.ts`: The bridge between Electron and the React renderer.
- `src/renderer/src/App.tsx`: The React starter screen.
- `src/renderer/src/assets/`: UI styles and images.
- `electron.vite.config.ts`: Build configuration for all three processes.
- `electron-builder.yml`: App identity and packaging configuration.

Keep filesystem access and other native work in the main process, and expose specific operations through preload as the app grows.
