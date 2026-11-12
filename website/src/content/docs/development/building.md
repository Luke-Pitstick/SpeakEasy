---
title: Building from source
description: Install the prerequisites, run SpeakEasy in development mode, and package installers for macOS, Windows, and Linux.
sidebar:
  order: 2
---

This page covers building SpeakEasy from a source checkout. If you only want to try the app, see [install SpeakEasy](../../getting-started/install/).

## Prerequisites

- **Git.**
- **Node.js 24.** The repository pins the major version in `.nvmrc`, and CI reads the same file. With nvm, run `nvm use` in the checkout.
- **npm**, which ships with Node.js. The project uses `package-lock.json`, so use npm rather than another package manager.
- **Network access during install.** The first install downloads the Electron binary and the MediaPipe face landmarker model.

## Clone and install

```sh
git clone https://github.com/Luke-Pitstick/SpeakEasy.git
cd SpeakEasy
npm ci
```

Day-to-day development happens on the `dev` branch. Check it out with `git switch dev` if you plan to contribute. See [releases and branches](../releases/).

### What postinstall does

`npm ci` runs the `postinstall` script, which does three things in order:

1. `install-electron` downloads the Electron binary for your platform.
2. `electron-builder install-app-deps` rebuilds any native dependencies against Electron.
3. `npm run assets:eye-tracking` runs `scripts/prepare-eye-tracking-assets.mjs`. It copies the MediaPipe WASM runtime out of `node_modules` and downloads `face_landmarker.task` from Google's MediaPipe model storage into `src/renderer/public/mediapipe/`. The model download is skipped when the file already exists. This folder is git-ignored, and it lets webcam gaze run offline afterwards.

If the model download fails, rerun `npm run assets:eye-tracking` once you are back online.

## Run in development

```sh
npm run dev
```

This opens Electron with hot reload for the renderer. You can steer, use exact spelling, and correct words without any provider account.

## Commands

| Command                          | What it does                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                    | Start Electron in development mode with renderer hot reload.                         |
| `npm start`                      | Preview the built app from `out/` with `electron-vite preview`.                      |
| `npm run lint`                   | Run ESLint over the repository (cached).                                             |
| `npm run format`                 | Rewrite files with Prettier.                                                         |
| `npm test`                       | Run the Vitest suite once.                                                           |
| `npm run typecheck`              | Type-check the main and preload code, the renderer, and the PPM tooling.             |
| `npm run typecheck:node`         | Type-check only `tsconfig.node.json` (main, preload, shared).                        |
| `npm run typecheck:web`          | Type-check only `tsconfig.web.json` (renderer).                                      |
| `npm run typecheck:ppm`          | Type-check only the initials PPM scripts.                                            |
| `npm run build`                  | Type-check, then build main, preload, and renderer into `out/`.                      |
| `npm run build:unpack`           | Build, then produce an unpacked app directory in `dist/` without an installer.       |
| `npm run build:mac`              | Build, then package for macOS.                                                       |
| `npm run build:win`              | Build, then package for Windows.                                                     |
| `npm run build:linux`            | Build, then package for Linux.                                                       |
| `npm run assets:eye-tracking`    | Copy the MediaPipe WASM files and download the face landmarker model.                |
| `npm run ppm -- <command>`       | Run the initials PPM CLI (`prepare`, `train`, `test`, `report`, `bundle`).           |

## Packaging per OS

Packaging uses electron-builder with the settings in `electron-builder.yml`. Installers are written to `dist/`. Build on the operating system you are packaging for.

| OS      | Command               | Output from the config                                                                                         |
| ------- | --------------------- | -------------------------------------------------------------------------------------------------------------- |
| macOS   | `npm run build:mac`   | electron-builder's default macOS targets, including a DMG. Signed with an ad-hoc identity (`-`), not notarized. |
| Windows | `npm run build:win`   | An NSIS installer named `speakeasy-<version>-setup.exe`. Not code-signed.                                     |
| Linux   | `npm run build:linux` | AppImage, snap, and deb packages. Building the snap needs snapcraft installed.                                 |

CI packages a narrower set: an Apple Silicon DMG, a Windows x64 NSIS installer, and Linux x64 AppImage and deb packages. To reproduce one locally, pass the same targets, for example:

```sh
npm run build
npm exec -- electron-builder --linux AppImage deb --x64 --publish never
```

Packaged builds exclude `.env`, tests, benchmarks, and source files. `THIRD_PARTY_NOTICES.md` is copied into the app's resources.

## Environment variables for cloud features

Cloud features are optional. In a source checkout, the main process reads credentials from the environment and from a private `.env` file at the repository root. Keep that file out of commits. A packaged build does not include `.env`, so set the variables in the environment of the process that launches SpeakEasy. Restart the app after changing them.

| Variable                | Enables                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `OPENROUTER_TOKEN`      | Phrase generation, refinement, context resolution, and memory extraction.     |
| `MOSS_PROJECT_ID`       | Moss retrieval over conversation turns and saved facts. Used with the token.  |
| `MOSS_PROJECT_TOKEN`    | Moss retrieval. Phrase generation fails without both Moss variables.          |
| `CARTESIA_API_KEY`      | Speech playback and live conversation transcription.                          |
| `TYPESAFE_AI_API_TOKEN` | Optional Jev tone suggestions.                                                |

Setting a key does not turn a feature on by itself. Generation also needs **Menu → Settings → Gemini → Enable Gemini**, and Jev needs **Suggest tone with Jev** in **Menu → Settings → Voice**. Some tests read extra variables to opt into live provider calls. See [testing](../testing/).
