---
title: Releases and branches
description: How changes flow from feature branches to main, what CI builds, how a tagged release is cut, and the current signing status.
sidebar:
  order: 4
---

## Branch flow

SpeakEasy uses two long-lived branches.

- **`dev`** is the integration branch. Open feature pull requests into `dev`.
- **`main`** is the release branch. Changes reach it through a pull request from `dev`.

A repository ruleset covers both branches. Every change needs a pull request, and the **Checks** job must pass against an up-to-date branch before merge.

## What CI builds on main

The workflow in `.github/workflows/ci.yml` has three jobs.

| Job          | Runs on                              | What it does                                                                                                                |
| ------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Checks       | Pull requests into `dev` or `main`, pushes to `main`, and `v*` tags | `npm ci`, lint, tests, and the production build. On a tag, it also validates the tag first.          |
| Installers   | Pushes to `main` and `v*` tags       | Packages installers on three runners after Checks passes, then uploads them as workflow artifacts.                          |
| Release      | `v*` tags only                       | Collects the installers and creates a draft GitHub release with generated notes.                                            |

The installer job builds:

| Platform        | Runner         | Artifacts                     |
| --------------- | -------------- | ----------------------------- |
| macOS (arm64)   | `macos-15`     | DMG                           |
| Windows (x64)   | `windows-2025` | NSIS installer (`-setup.exe`) |
| Linux (x64)     | `ubuntu-24.04` | AppImage and deb              |

After a merge to `main`, you can download these from the Actions run. They are test builds.

## Cutting a release

1. Open a pull request that updates `version` in `package.json` and `package-lock.json`.
2. After it merges to `main`, tag the merged commit with a matching `v` tag and push it:

   ```sh
   git tag v0.1.0 <main-commit>
   git push origin v0.1.0
   ```

3. CI checks that the tag matches the `package.json` version and that the tagged commit is on `main`. If either check fails, the run stops.
4. Once all installers build, CI creates a **draft** release with the installers attached.
5. Review the draft and publish it from GitHub Releases. Publishing rebuilds the website, and the [Install](../../getting-started/install/) page then links to the new installers.

## Current status

- The package version is `0.1.1`, and the `v0.1.1` release is published with a macOS DMG, a Windows installer, an AppImage, and a deb.
- The older `v0.1.0` release is still a draft.

## Signing

| Platform | Status                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS    | Signed with an ad-hoc identity so the app bundle is sealed, and CI verifies it with `codesign --verify`. It is not signed with a Developer ID and not notarized, so macOS warns on first launch. |
| Windows  | Not code-signed. Windows SmartScreen may warn when you run the installer.                                                                                                       |
| Linux    | AppImage and deb packages are not signed.                                                                                                                                      |

macOS notarization and Windows release signing need signing credentials and configuration that the project does not have yet. See [install SpeakEasy](../../getting-started/install/) for installing a build.
