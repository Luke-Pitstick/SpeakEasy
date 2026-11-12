---
title: Contributing
description: Report a bug, share an eye tracker compatibility report, open a pull request, and follow the project's coding standards.
sidebar:
  order: 5
---

SpeakEasy welcomes bug reports, tracker compatibility reports, documentation fixes, and code. Everyone taking part follows the [code of conduct](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/CODE_OF_CONDUCT.md).

## Report a bug

Open an issue at [github.com/Luke-Pitstick/SpeakEasy/issues](https://github.com/Luke-Pitstick/SpeakEasy/issues). Include:

- Your operating system and version.
- The SpeakEasy version or commit you ran, and whether it was `npm run dev` or a packaged build.
- Your input method: **Mouse**, **Eye tracker (webcam)**, **Head pointer (webcam)**, or a dedicated eye tracker in **Mouse** mode, and whether **Dwell activation** was on.
- The steps you took, what you expected, and what happened instead.
- Which cloud features were configured, if any.

Use sample phrases instead of personal messages. Remove credentials, `.env` contents, and private conversation from screenshots and logs.

To report a security problem, do not open a public issue. Contact the maintainers privately through the repository.

## Submit a tracker compatibility report

Reports about specific eye trackers help other people choose hardware, and successful setups are as useful as failures. Use the **Eye tracker compatibility report** issue template when you open a new issue. It asks for:

- The tracker make and model, operating system, and driver and tracker software versions.
- The SpeakEasy version or commit, pointer mode, and dwell settings.
- Whether the tracker moves the desktop pointer continuously, and whether you could dwell on a control, steer in Dasher, and review a phrase.
- What the pointer and the app did when the tracker lost your gaze and found it again.
- Steps to reproduce any problem.

## Open a pull request

1. Fork the repository and branch from `dev`.
2. Make your change, keeping it focused on one problem.
3. Run `npm run lint`, `npm test`, and `npm run build`. See [testing](../testing/).
4. Try the affected flow in the running app with `npm run dev`.
5. Open the pull request against `dev`. Changes reach `main` later through a pull request from `dev`. See [releases and branches](../releases/).

The **Checks** job must pass before a pull request can merge.

## Coding standards

- **ESLint and Prettier.** `npm run lint` must pass. Format with `npm run format` or your editor's Prettier integration. The Prettier config uses single quotes, no semicolons, a 100-character line width, and no trailing commas.
- **TypeScript.** `npm run typecheck` must pass for the main, renderer, and PPM configurations.
- **SPDX headers.** Every source file starts with an SPDX header. Copy it from a neighboring file:

  ```ts
  // SPDX-FileCopyrightText: 2026 SpeakEasy contributors
  // SPDX-License-Identifier: GPL-3.0-only
  // See LICENSE for the full terms, including the warranty disclaimer.
  ```

  Use `#` comments in YAML and shell files.
- **No em dashes.** Do not use the em dash character in code, comments, documentation, or commit messages. Use a plain hyphen or rewrite the sentence.
- **Process boundaries.** Keep credentials, databases, and provider calls in `src/main/`. Expose new operations through a specific, validated preload method, never a general-purpose bridge. See [architecture](../architecture/).
- **Product invariants.** Do not let a suggestion change text or start speech without an explicit user action, and keep exact spelling usable without any model.
- **Keep it simple.** Change only what the task needs. Remove experiments you decide against rather than leaving them behind a flag.
- **Third-party code.** If you adapt code from another project, record the source, pinned revision, license, and your changes in `docs/source-manifest.md` and `THIRD_PARTY_NOTICES.md`, and add the license text under `licenses/`. See [licenses and credits](../licenses/).

## What a good pull request includes

- A short description of the problem and how the change solves it.
- Tests for the behavior you changed, especially state transitions, stale response handling, dwell, tracking loss, speech authorization, and cancellation.
- A note on how you verified it: automated checks, manual mouse testing, real gaze testing, or live provider testing. Name what you could not test.
- Screenshots or a short recording for visible interface changes, using sample phrases.
- Documentation updates when behavior, settings, or setup steps change.
