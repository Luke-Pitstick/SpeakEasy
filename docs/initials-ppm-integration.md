# Frozen initials PPM in Dasher

The renderer uses an AAC-only initials PPM. It loads a frozen table of next-initial probabilities for steering. Exact spelling uses the separate literal-character PPM.

## Model and controls

The bundled [initials-model.json](../src/renderer/src/features/dasher/initials-model.json) is distributed under CC BY 4.0. It uses at most two preceding initials and 10% uniform smoothing. Its SHA-256 is `f16463da8e77c3eba90b1df4bce72186f07a3d27f1e9bf50459f7ab66e1ba8e0`, verified by an automated test. [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The adapter keeps the frozen vectors' relative letter weights and reserves a fixed share for each punctuation mark. Every letter retains at least `0.1 / 26`, approximately 0.385%, before the punctuation share.

The Dasher heading identifies **Trained initials PPM · 10% smoothing**. **Menu → Settings → Letter prediction** offers **PPM (trained initials)** and **Uniform**; changing the condition pauses input before replacing the engine. Exact spelling identifies **Character PPM**. Invalid artifacts or a different smoothing value produce an explicit unavailable/uniform status and retain usable entry.

## Training file and reproduction

The sole training input is the 5,019-message `sent_train_aac.txt` split of Keith Vertanen and Per Ola Kristensson's _A Crowdsourced Corpus of AAC-like Communications_. The publishers' CC BY 4.0 grant explicitly covers this file. Its archived copy and a fresh publisher download both have SHA-256 `ddc0ad61652cec5f4a8b76f1dd63f92fa9d5c1197e0a65f7a13d71873aed91bd`. The model contains smoothed probability tables derived from word initials. The source text stays local and the build ships the [attribution](../THIRD_PARTY_NOTICES.md). [Publisher and corpus](https://aactext.org/imagine/) · [Training file](https://aactext.org/imagine/aac_comm/sent_train_aac.txt) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

```sh
mkdir -p .cache/initials-ppm
curl -fL https://aactext.org/imagine/aac_comm/sent_train_aac.txt -o .cache/initials-ppm/aac-train.txt
npm run ppm -- bundle .cache/initials-ppm/aac-train.txt
```

The bundle command checks the input hash before training and writes the renderer asset directly. Its history and smoothing match the [historical AAC/Turk run](./initials-ppm-results.md). Turk and COMM2 supply zero training data to this build.

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

The offline comparison used the same test records and excluded any full message seen in either historical training source. Lower bits per initial is better. The AAC-only model stays close on AAC, loses accuracy on Turk, and retains an advantage over the AAC unigram on COMM2.

| Historical test split | Mixed PPM | AAC-only PPM | AAC unigram |
| --------------------- | --------: | -----------: | ----------: |
| AAC                   |     3.891 |        3.893 |       4.168 |
| Turk                  |     4.047 |        4.216 |       4.172 |
| COMM2                 |     3.852 |        3.958 |       4.123 |

The initials integration tests exercise these behaviors with the bundled asset.

| Check                           | Result                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Artifact identity and smoothing | Matching SHA-256 and exact vector identity across start, ordinary, rare, and long histories                 |
| Rare entry/reversal/re-entry    | `q`, `x`, `z` after five histories at heights 188, 330, and 600: all 45 combinations passed                 |
| Multi-root reversal             | Entered `iwqxzq`, reversed to empty with original root fractions, then entered/reversed `zxq`               |
| Active weights                  | All observed fraction arrays stayed frozen and identical over 600 frames, including pause/resume and resize |
| Locked-word context             | Preceding initials condition predictions without exposing locked content to reversal                        |
| Condition changes and spelling  | Switching weights pauses input; exact spelling keeps its character predictor                                |
| Invalid artifact                | Invalid input or a different smoothing value yields an unavailable/uniform status                           |

The synthetic controller knows target geometry. Same-tracker timing, error rates, and usability with human gaze remain unmeasured.
