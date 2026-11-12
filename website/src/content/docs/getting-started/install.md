---
title: Install
description: Build and run SpeakEasy from source, and what the test installers built by GitHub Actions are.
sidebar:
  order: 1
---

SpeakEasy is in development. Building from source is the supported way to run it today.

## Requirements

- **Git**, to clone the repository.
- **Node.js 24**. The repository pins this version in `.nvmrc`, and CI uses the same file. If you use a version manager such as nvm, run `nvm use` in the checkout.
- **npm**, which comes with Node.js.
- A network connection for the first install. `npm ci` downloads Electron and the webcam face model. After that, webcam tracking runs offline.

You do not need any accounts to open the app, steer, or write in exact spelling mode. Phrase suggestions and speech need cloud credentials; see [Cloud features](../cloud-features/).

## Install from source

```sh
git clone https://github.com/Luke-Pitstick/SpeakEasy.git
cd SpeakEasy
npm ci
npm run dev
```

`npm ci` installs dependencies and then prepares the webcam model and its WebAssembly runtime. `npm run dev` opens SpeakEasy in development mode.

This clones the default branch, `main`. New work is merged into the `dev` branch first and then promoted to `main`, so `dev` can sometimes have changes that `main` does not have yet.

To preview a production build instead of development mode, run `npm run build` and then `npm start`. To make your own installer, see [Building](../../development/building/).

When the app opens, continue with the [Quick start](../quick-start/).

## Test installers

There is no published GitHub release yet. Installers are currently produced as build artifacts by the **Build and release** GitHub Actions workflow each time a change is merged to `main`. They are unsigned test builds:

| Platform            | Artifact name             | Contents                       |
| ------------------- | ------------------------- | ------------------------------ |
| macOS Apple Silicon | `speakeasy-macos-arm64`   | DMG                            |
| Windows x64         | `speakeasy-windows-x64`   | NSIS setup `.exe`              |
| Linux x64           | `speakeasy-linux-x64`     | AppImage and Debian `.deb`     |

To get one, open a successful run of the workflow on `main` in the repository's **Actions** tab and download the artifact. GitHub requires you to be signed in to download workflow artifacts.

:::caution
These builds are for testing. The macOS app has only an ad-hoc signature and is not notarized, and the Windows installer is not signed, so your operating system may warn about or block them. There is no Intel macOS or Arm Windows/Linux build.
:::

A packaged build does not read a `.env` file. To use cloud features with an installer, set the credentials in the environment of the process that launches SpeakEasy, as described in [Cloud features](../cloud-features/).
