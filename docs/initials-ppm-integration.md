# Frozen initials PPM in Dasher

The local renderer now uses the trained AAC/Turk initials PPM for initials entry. Exact spelling continues to use the literal-character PPM. No training, remote prediction, or adaptive learning runs during steering.

## Model and controls

The bundled [initials-model.json](../src/renderer/src/features/dasher/initials-model.json) is an exact copy of the [evaluated artifact](../artifacts/initials-ppm/f70020135ab3a402/model.json). SHA-256: `2780b90e230892ba92fd8c2c16053c8d61558595a1a92b2247b48ee02d5171ba`. An automated test verifies its bytes. The selected model uses at most two preceding initials, 50/50 source interpolation, and 10% uniform smoothing; see the [offline evaluation](./initials-ppm-results.md).

The prediction adapter returns those frozen vectors directly, without another normalization/smoothing pass. Every initial retains at least `0.1 / 26`, approximately 0.385%, model probability. The former authored-fixture initials model was removed.

The Dasher heading identifies **Trained initials PPM · 10% smoothing**. **Menu → Settings → Letter prediction** offers **PPM (trained initials)** and **Uniform**; changing the condition pauses input before replacing the engine. Exact spelling identifies **Character PPM**. Invalid artifacts or a different smoothing value produce an explicit unavailable/uniform status and retain usable entry.

## Region stability and context

Each branch receives a frozen fraction array at creation. Steering changes position and scale, never the branch's fractions. Promotion saves ancestry fractions; reversal restores those arrays. Pause/resume and resize preserve the active root's fractions. The trained model is immutable, loaded once, and has no asynchronous replacement path.

The existing layout additionally reserves minimum onscreen letter intervals and limits an overly large letter from crossing the crosshair at rest. This was preserved to keep the full initial alphabet visible and rare choices available. It blends display fractions toward uniform according to viewport height, separately from the model's 10% smoothing, and can make visible regions substantially more uniform than the evaluated probabilities. Offline loss scores therefore do not describe the exact onscreen area distribution or establish faster entry.

Locked words and prefixes contribute their initial to preceding prediction context, while only the trailing editable initials become reversible engine output. For example, locked `i`, `want` followed by editable `a` conditions prediction on `iwa`, but reversal cannot erase `want`. Unsupported locked tokens reset context. Prior accepted messages and surrounding conversation are not model inputs.

## Verification

```sh
npm run test -- tests/initials-dasher.test.ts tests/initials-dasher-ui.test.tsx
npm run test
npm run lint
npm run typecheck
npm run build
```

The final full suite passed **67 tests across seven files**, including nine new integration tests. Lint, main/renderer/tool typechecks, and the production build passed. The latest shared-workspace build was reloaded and its trained-model heading confirmed after the workspace layout update.

| Check                           | Result                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Artifact identity and smoothing | Matching SHA-256 and exact vector identity across start, ordinary, rare, and long histories                 |
| Rare entry/reversal/re-entry    | `q`, `x`, `z` after five histories at heights 188, 330, and 600: all 45 combinations passed                 |
| Multi-root reversal             | Entered `iwqxzq`, reversed to empty with original root fractions, then entered/reversed `zxq`               |
| Active weights                  | All observed fraction arrays stayed frozen and identical over 600 frames, including pause/resume and resize |
| Locked-word context             | Preceding initials condition predictions without exposing locked content to reversal                        |
| Condition changes and spelling  | Switching weights pauses input; exact spelling keeps its character predictor                                |
| Invalid artifact                | Invalid input or a different smoothing value yields an unavailable/uniform status                           |

The synthetic controller initially stalled on bottom-edge `z` at a 600 px viewport after seed `iw`: its 15 px aiming margin kept it outside the target interval and repeatedly exposed the parent. Reducing the controller margin to 8 px, matching the existing helper, fixed the minimized regression and the full matrix without changing the engine/model. These controllers know target geometry; they do not establish human gaze usability.

Native Electron verification used the rebuilt `out/renderer/index.html` in the running **Electron** development window, rather than the older packaged **SpeakEasy.app** scaffold. Confirmed the trained-model heading and Settings selection, visually inspected the full alphabet, entered a rare `z` using native mouse steering, and reversed it to an empty buffer before pausing. No eye tracker was used.

## Remaining limits

Same-tracker timing, error rates, and usability comparisons remain outstanding. The minimum-region layout policy can reduce the model's statistical advantage, so its interaction effect still needs measurement. The dataset current-page/older-README license discrepancy is preserved in the offline results and acquisition snapshots. This task verified local integration, not public distribution or an installed-app update; the older packaged application was not rebuilt or replaced.
