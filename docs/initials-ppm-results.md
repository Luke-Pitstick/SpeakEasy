# Initials PPM: first offline training run

The frozen PPM passes the predeclared development and final prediction-quality gates. These are the original offline results, not a claim of faster gaze entry. The subsequent [Dasher integration and reachability checks](./initials-ppm-integration.md) are documented separately.

Run ID: `f70020135ab3a402`. Model SHA-256: `2780b90e230892ba92fd8c2c16053c8d61558595a1a92b2247b48ee02d5171ba`.

## Reproduce and inspect

Requires Node 24 and the project's installed npm dependencies; acquisition uses `curl`. No new packages were added. From the repository root:

```sh
npm run ppm -- prepare
npm run ppm -- train
npm run ppm -- test
npm run ppm -- report
```

`prepare` verifies the pinned AAC train/dev and original Turk files and snapshots the source pages/READMEs. `train` runs the fixed candidate grid on development splits, exports a model, checks lookup parity, records the local benchmark, and freezes hashes. `test` acquires AAC test and COMM2 only after the development gate passes, verifies the frozen code/model/input identities, and records the final evaluation. `report` reads existing results without training or scoring again.

The source cache is ignored under `.cache/initials-ppm/`. Model and result files are under `artifacts/initials-ppm/<run-id>/`, outside the renderer assets. Repeating `train` with identical code/protocol/source hashes reuses the frozen run. Repeating `test` refuses to overwrite its final result. Code changes produce a new training run; previously seen COMM2 data cannot become a fresh unseen benchmark just by changing the run ID.

- [Frozen model](../artifacts/initials-ppm/f70020135ab3a402/model.json)
- [Frozen identity and settings](../artifacts/initials-ppm/f70020135ab3a402/freeze.json)
- [All development candidates and breakdowns](../artifacts/initials-ppm/f70020135ab3a402/development.json)
- [Final metrics and paired intervals](../artifacts/initials-ppm/f70020135ab3a402/final.json)
- [Runtime benchmark](../artifacts/initials-ppm/f70020135ab3a402/benchmark.json)
- [Generated report](../artifacts/initials-ppm/f70020135ab3a402/report.md)

## Training and selection

The finalized tokenizer produced 25,111 AAC and 39,173 Turk training initials: **64,284 targets** from 5,019 AAC messages and 859 six-turn Turk dialogues. Unsupported lexical tokens reset context, contractions retain one initial, and independent turns never share context. Repeated messages were retained. The model is frozen at evaluation time, with no online adaptation.

We evaluated 45 PPM candidates: five maximum histories, three source weights, and three uniform mixtures. The unigram baseline was separately tuned over nine source/floor combinations using the same unseen-text development criterion. Uniform always assigns `1/26` to each letter. No development examples were added to the final training counts.

Selected PPM settings:

- At most **two preceding initials**, backing off to shorter contexts when necessary.
- **50% AAC / 50% Turk** probability interpolation, independent of source length.
- **10% uniform mixture**, giving every letter at least approximately 0.385% probability.
- The existing estimator's `alpha = 0.49`, `beta = 0.77`, interpolation without symbol exclusion.

The selected unigram uses AAC frequencies with 5% uniform mixture. The tie rule deliberately favors a larger floor when loss is within 0.01 bits of the minimum. For history two, 5% smoothing had slightly lower development loss (3.9172) than the selected 10% (3.9204); that difference was within the predefined tolerance.

| Maximum preceding initials | Best balanced unseen-text development loss, bits/initial |
| -------------------------- | -------------------------------------------------------: |
| 2                          |                                                   3.9172 |
| 4                          |                                                   3.9340 |
| 6                          |                                                   3.9372 |
| 8                          |                                                   3.9372 |
| 10                         |                                                   3.9372 |

Longer context did not improve this experiment. This is still a PPM estimator with backoff; its selected history cap happens to be two. These results provide no evidence that five or ten initials help on this corpus.

Training, development selection, selected-model export/parity, and the paired development comparison took **2.89 seconds** in this run. That elapsed interval excludes downloading and the separate lookup benchmark.

## Held-out performance

The primary rows below exclude messages whose normalized full text appeared in either training source. All numbers use the exported frozen lookup. Lower bits/initial is better: it means the intended letter receives more probability on average, not that the user enters letters that many percent faster.

| Final split | Unseen messages | Evaluated initials | Uniform bits | Unigram bits |  PPM bits | Unigram top-3 | PPM top-3 |
| ----------- | --------------: | -----------------: | -----------: | -----------: | --------: | ------------: | --------: |
| AAC         |             449 |              2,264 |        4.700 |        4.168 | **3.891** |         31.1% | **41.8%** |
| Turk        |           1,563 |             12,359 |        4.700 |        4.172 | **4.047** |         32.0% | **36.3%** |
| COMM2       |           1,430 |             11,455 |        4.700 |        4.123 | **3.852** |         32.8% | **42.3%** |

The uniform baseline's tied top-3 credit is `3/26`, approximately 11.5%. All rank metrics use fractional credit for ties, avoiding an arbitrary alphabetical advantage.

Paired improvements over the tuned unigram:

| Final split | Improvement, bits/initial | Paired 95% interval |
| ----------- | ------------------------: | ------------------- |
| AAC         |                     0.276 | 0.229–0.322         |
| Turk        |                     0.125 | 0.106–0.144         |
| COMM2       |                     0.271 | 0.250–0.291         |

The balanced development improvement was 0.231 bits/initial, interval 0.207–0.253, exceeding the predeclared 0.10-bit threshold. The final COMM2 improvement favors PPM against both unigram and uniform; neither original test source regressed. Both offline gates pass.

The stricter COMM2 subset whose entire initial string was absent from training still improves: **3.860 PPM vs 4.125 unigram bits/initial**, over 11,286 initials. On the complete COMM2 set, including familiar text, results are 3.839 vs 4.121 bits/initial. Thus the gain is not confined to complete initials strings already seen during training.

The downloaded AAC final file contained **566** nonblank messages rather than the 563 listed on the source page; the source snapshot and actual counts are recorded. COMM2 contained the documented 1,506 messages. No records were silently trimmed to make source-page counts match.

Intervals use 2,000 fixed-seed paired bootstrap resamples. Turk is resampled by whole dialogue; AAC and COMM2 by message. Worker IDs and COMM2 scenario grouping are not exposed by the parsed files, so these intervals omit possible dependence among contributors and shared situations. The data remains invented AAC-like language, not a sample of naturally occurring AAC use.

## Runtime and navigation implications

Benchmark environment: Apple M1 Pro, arm64 macOS, Node v24.22.1. Five warmed passes over 10,000 development prefixes produced 50,000 lookup samples.

| Measurement                           |                             Observed |
| ------------------------------------- | -----------------------------------: |
| JSON asset size, uncompressed         | 328,366 bytes, approximately 321 KiB |
| Exported contexts                     |                                  606 |
| Parse plus validation                 |                              2.00 ms |
| Loaded heap increase with explicit GC | 412,040 bytes, approximately 402 KiB |
| First lookup after loading            |                           0.00275 ms |
| Warm lookup p95                       |                          0.000208 ms |
| Warm lookup p99                       |                          0.000250 ms |

These are offline Node measurements. They exclude Electron/renderer overhead, drawing, tracker processing, and sample-to-visible-feedback latency. Their practical implication is that this model does not need a per-frame inference process or remote call; it does not establish whole-app latency.

The tail is less favorable than the average. On unseen COMM2 messages, the intended letter receives under 1% probability **2.87% of the time with PPM vs 2.16% with unigram**. Its fifth-percentile probability is 1.36% vs 2.69%. The floor guarantees a positive weight but does not guarantee a comfortably reachable target in our geometry. This must be checked before changing the default input behavior.

## Judgment and remaining gates

Proceed to a separately scoped Dasher experiment with this frozen history-two model. It beats a tuned frequency-only baseline on every held-out source and is small enough that model lookup should be negligible relative to navigation and rendering. There is no evidence here to justify increasing context or collecting more data just to reduce inference cost.

Keep the 10% floor for the first geometry/reachability check; do not retune it using these final sets. Compare rare-letter entry and reversals against uniform and unigram, followed by the same-tracker gaze comparison. The possible cost of narrower unlikely-letter regions is the main unresolved implementation concern.

The full repository test suite passed: **48 tests**, including nine new preparation/PPM/scoring tests. Lint, application and tool typechecks, and the production build passed. Core tests include parity against the existing jslm-derived estimator, frozen-export equivalence over seen/unseen/start contexts, message boundaries, unsupported-token resets, held-out membership, causal scoring, and deterministic paired bootstrap behavior.

Current [AAC](https://aactext.org/imagine/), [Turk](https://aactext.org/turk/), and [COMM2](https://aactext.org/comm2/) source pages list CC BY 4.0, while the older packaged Turk/COMM2 READMEs list BY-ND. The local acquisition snapshots preserve that discrepancy; public distribution of the derived artifact remains unresolved. No private user text was collected. This training run was offline; the later local renderer integration is recorded in the linked integration document.
