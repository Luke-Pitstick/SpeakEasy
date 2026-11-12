# Contributing to SpeakEasy

Thank you for helping. The full guide is on the project site:
[Contributing](https://luke-pitstick.github.io/SpeakEasy/development/contributing/).
Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## Report a bug

Open an [issue](https://github.com/Luke-Pitstick/SpeakEasy/issues) with your operating system,
the SpeakEasy version or commit, your input method and dwell settings, the steps you took, and what
happened. Use sample phrases, and remove credentials and private conversation from screenshots and
logs. Report security problems privately to the maintainers, not in a public issue.

## Share a tracker compatibility report

Use the **Eye tracker compatibility report** issue template. Successful setups are as useful as
failures.

## Open a pull request

1. Fork the repository and branch from `dev`.
2. Keep the change focused on one problem.
3. Run `npm run lint`, `npm test`, and `npm run build`.
4. Try the affected flow in the running app with `npm run dev`.
5. Open the pull request against `dev`. The **Checks** job must pass before merge.

In the description, explain the change, list the tests you added, and say how you verified it:
automated checks, mouse, real gaze, or live provider. Mouse success does not establish gaze
usability, and mock responses do not establish live provider behavior.

## Standards

- `npm run lint` and `npm run typecheck` pass. Format with Prettier (`npm run format`).
- Every source file starts with the SPDX header used in the rest of the repository
  (`SPDX-License-Identifier: GPL-3.0-only`).
- Do not use the em dash character anywhere. Use a plain hyphen or rewrite the sentence.
- Keep credentials and provider calls in the main process, and expose new operations through a
  specific, validated preload method.
- Record adapted third-party code in `docs/source-manifest.md` and `THIRD_PARTY_NOTICES.md`.

By contributing, you agree that your contributions are licensed under [GPL-3.0-only](LICENSE).
