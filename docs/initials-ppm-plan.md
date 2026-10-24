# Word-initial PPM: training and validation plan

Status: offline training and local Dasher integration implemented, 2026-10-23. The [first frozen run](./initials-ppm-results.md) passes the development and held-out prediction gates; [integration checks](./initials-ppm-integration.md) cover stable regions, rare entry/reversal, and native mouse input. Gaze validation remains outstanding. This supersedes the proposed fixed-order initials n-gram experiment. PPM predicts the next word initial from variable-length initial history; it does not expand initials into words.

## Decision and scope

Train offline on the AAC training messages and original Turk training dialogues. Select settings using their development splits. Freeze one candidate before scoring the original test splits and COMM2. Integrate only after both prediction quality and navigation checks pass.

The first version is English `a`–`z`, frozen after training, and local. It conditions on initials within the current composition buffer, including the first letter of a locked word. It does not condition on the meaning of locked words, partner speech, accepted previous messages, or personal memory. Exact spelling remains a separate predictor. No online learning or conversation logging is included.

## Sources and audit

Use the published [AAC corpus](https://aactext.org/imagine/) and [Turk dialogues](https://aactext.org/turk/). Keep [COMM2](https://aactext.org/comm2/) for final evaluation. These are invented communications; none establishes performance on naturally occurring AAC conversation.

| Source                  | Training                                            | Development                                     | Final evaluation                                                                |
| ----------------------- | --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| AAC communications      | `sent_train_aac.txt`: 5,019 nonblank lines observed | `sent_dev_aac.txt`: 557 nonblank lines observed | `sent_test_aac.txt`; publisher lists 563 messages, validate count when acquired |
| Original Turk dialogues | 859 dialogues, 5,154 turns observed                 | 280 dialogues, 1,680 turns observed             | 280 dialogues, 1,680 turns observed                                             |
| COMM2                   | Never                                               | Never                                           | Publisher lists 1,506 messages; validate count when acquired                    |

The [AAC README](https://aactext.org/imagine/aac_comm/readme.txt) describes worker-separated splits. Preserve them. The [Turk README](https://aactext.org/turk/turk/readme.txt) describes dialogue-level split labels, not a verified worker-disjoint split; preserve entire dialogues and do not invent a worker-independence claim. Each original Turk row has exactly eight tab-separated fields: split, dialogue ID, and six turns. Parse literal tabs; quotes are text.

Use the original Turk file. The downloaded filtered file has inconsistent tab separation, including IDs joined to turn text by spaces. Do not silently parse it as a clean seven-column table, substitute missing turns, or mix it with the original. The initials predictor emits letters rather than suggested phrases, so the original file's inclusion of profanity does not authorize censorship of user input.

The current dataset pages say CC BY 4.0. Older packaged Turk and COMM2 READMEs say BY-ND 3.0. Preserve both notices and the current pages in the source manifest; resolve that discrepancy before redistributing the derived asset. Do not infer licensing from a mirror. The two auxiliary files excluded from the AAC page's blanket license are not inputs to this experiment.

Audit of the downloaded training data, before deduplication or token-policy changes:

- AAC contributes 25,112 initials; Turk contributes 39,205. The total is 64,317 initials in 10,173 messages/turns, not millions of training examples.
- AAC has 4,600 unique messages and Turk training has 5,080 under NFKC/lowercase/curly-apostrophe/whitespace normalization; 235 distinct messages occur in both sources.
- Under that same text key, 113 AAC development messages and 116 Turk development turns match at least one training message. Familiar text must be reported separately from unseen text.
- Among training histories immediately preceding another initial, only 35 distinct six-initial histories occur at least three times; only one eight-initial history does. These counts retain repeated messages and omit start markers. Long history is sparse even before stricter cleanup.
- Thirty-two Turk training turns exceed the current UI's 24-initial buffer limit. They may contribute training counts, but offline results must also report the first 24 initials separately, matching the currently reachable input length.

These are source/format observations, not trained-model or usability results. COMM2 has not been downloaded or scored. Turk test rows were audited for format and aggregate counts only, without fitting or model selection. The audit extracted words with `[A-Za-z]+(?:['’][A-Za-z]+)*`; the later production tokenizer must additionally implement the unsupported-token barriers below and regenerate these statistics.

Pin the source bytes before implementation. SHA-256 values observed in this audit:

| File                                                                                 | SHA-256                                                            |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| [AAC train](https://aactext.org/imagine/aac_comm/sent_train_aac.txt)                 | `ddc0ad61652cec5f4a8b76f1dd63f92fa9d5c1197e0a65f7a13d71873aed91bd` |
| [AAC dev](https://aactext.org/imagine/aac_comm/sent_dev_aac.txt)                     | `ea15844416675800787f13767b3ab94d982a656094ee1865692af7947e8ad524` |
| [Turk original](https://aactext.org/turk/turk/turk-dialogues.txt)                    | `7bd80a8a8fe1e3ee91158072b4adc198db691f96196b27acf28ea8335507dafb` |
| [Turk filtered, excluded](https://aactext.org/turk/turk/turk-dialogues-filtered.txt) | `b820e18842b2155dfddd6e857e8211525fbbd62c751800551759c868d21416db` |

## Preparation and leakage control

1. Download only explicitly listed files. Store source URL, retrieval date, bytes, hash, license evidence, parser version, and split membership in a manifest. Keep raw files outside the renderer bundle. Missing fields, duplicate dialogue IDs, unknown split labels, or changed hashes fail acquisition with a diagnostic; do not silently skip malformed rows.
2. Preserve one AAC line or Turk turn as one independent composition. Keep dialogue IDs for grouped evaluation. Never concatenate turns, alternate speakers, or unrelated messages to manufacture longer histories. Do not count IDs, split labels, punctuation, or markup as initials.
3. Use one versioned tokenizer for dataset preparation and word-to-initial conversion in the application: NFKC normalization, lowercase, normalize curly apostrophes, and extract English alphabetic words with internal apostrophes. Thus `don't` contributes `d`, and `I'll` contributes `i`; do not expand contractions into multiple words. Hyphens separate words. A token containing digits, or a word requiring unsupported non-ASCII initials, is a context barrier: log its count and reset history after it rather than deleting it and joining its neighbors. Standalone punctuation does not create a target. Keep the audit tokenizer's simpler ASCII-regex counts distinguished from the eventual production preprocessing report.
4. Prepend one start-of-composition context marker to every eligible segment. The marker is context only, never a selectable output. Reset context between turns and at unsupported tokens. There is no end-of-message prediction: probabilities are conditional on the user choosing to enter another initial. Train source-specific context counts from complete turns, with at most ten preceding initials retained.
5. Retain repeated training messages for the first experiment: their frequency is part of the supplied distribution, though it is not a measured frequency of natural AAC use. Report their concentration. Do not deduplicate by initials; different sentences legitimately collapse to the same string. Keep the split assignment fixed. If a provenance audit finds an actual dialogue copied across splits, quarantine that dialogue group from training before model selection and record the exclusion.
6. Define novelty from training membership, without changing the model: score the full held-out split, the subset whose normalized full text is absent from training, and the stricter subset whose entire initial string is absent. The second is the primary selection subset; the third diagnoses collisions. Do not call the full split leakage-free merely because workers differ. Do not move held-out records into training or tune on test overlap statistics.

Token policies must be frozen before development scoring. The offline tool and application must agree on locked-word initials and buffer boundaries. For the existing engine, use an explicit preceding-initial context when seeding the editable suffix after a locked word; never feed `{coffee}` display syntax into the model.

## PPM training and candidate selection

Reuse the probability rule of the Apache-2.0 jslm-derived PPM algorithm already present in `src/renderer/src/features/dasher/prediction.ts`. The offline implementation in `src/shared/initialsPpm.ts` uses context-count tables; training, evaluation, export, and future runtime lookup share this module. The literal predictor remains separate and unchanged in behavior, with its class exported only for parity tests. Tests compare distributions on histories without the new context-only start marker. Preserve the attribution; no Python approximation is used.

Specify the estimator rather than labeling it an unspecified PPM variant. For a context with total count `C`, a seen letter with count `c` receives `(c - beta) / (C + alpha)` of the remaining mass; pass the residual to the suffix context and ultimately a uniform distribution. Use the existing `alpha = 0.49` and `beta = 0.77`. This is interpolation without symbol exclusion, matching the current implementation's probability rule. Do not claim PPM-C or add exclusion while tuning other choices. Verify that repeated records accumulate counts and that per-turn context reset does not erase learned counts.

Build one model per training source. Interpolate their normalized distributions so source balance is explicit rather than determined by which corpus has longer turns. The bounded development search is:

| Choice                      | Candidates                              |
| --------------------------- | --------------------------------------- |
| Maximum preceding initials  | 2, 4, 6, 8, 10                          |
| AAC probability weight      | 0, 0.5, 1; Turk weight is the remainder |
| Uniform probability mixture | 0.05, 0.10, 0.20                        |

This is 45 candidates over two small source models per history setting. The zero/one source weights are ablations that test whether adding the other corpus helps. Include uniform and a source-balanced empirical unigram as baselines. Tune the unigram's source mixture and uniform floor on the same development criterion; compare contextual models against the strongest unigram, not an artificially weak baseline. Maximum history is a cap; PPM backs off instead of assuming every ten-initial context is supported.

Apply the final floor exactly once: `p(letter) = (1 - epsilon) * p_ppm(letter) + epsilon / 26`. Validate the raw and final distributions. The current renderer's `normalize()` also mixes in uniform mass; the implementation must avoid applying a second floor after export. Evaluate the exact weights that the engine will receive.

Choose settings using an equally weighted mean of AAC and Turk development loss on their unseen-text subsets. Define training membership against the union of both sources' training texts for all candidates, including single-source ablations, so every candidate is evaluated on the same records. Record full-split and per-source results too. Use a fixed tie tolerance of 0.01 bits per initial: prefer shorter history, then a single source if tied with a mixture, then the larger floor, then AAC if the two single-source candidates still tie. Freeze the tokenizer, training manifests, candidate grid, selection rule, artifact, and evaluation code together. Keep development examples out of the final trained artifact so the tested model remains identical to the integrated model.

## Validation loop and gates

### 1. Correctness before quality

Check all 26 outputs, finite nonnegative values, sum-to-one tolerance, the floor bound, empty/unseen histories, contractions, punctuation, unsupported-token resets, long input, and start markers. Verify no training counts cross message boundaries and evaluation never updates counts. Test the effect of distinct histories sharing a suffix and backoff from an unseen long history. Empty/missing/corrupt artifacts must retain usable uniform initials with a visible status. Exact spelling, undo, and manual mode controls remain usable.

### 2. Development feedback

At each position, predict before revealing the next initial. Input is only the permitted prefix. Record:

- **Primary loss:** mean `-log2(p_actual)` in bits per initial. Uniform is `log2(26)`, approximately 4.7004 bits. Lower loss means more probability allocated to intended letters; it is not a speed measurement.
- **Supporting metrics:** top-1/top-3/top-5 accuracy, actual-letter probability median and fifth percentile, and the fraction of intended letters below 1% probability. These expose narrowing that disproportionately hurts uncommon choices. Rank metrics alone cannot select a Dasher model.
- **Breakdowns:** each source, full/unseen-text/unseen-initial-string subsets, position 1, positions 2–5, 6–10, and 11+, and each target letter. Include sample counts so sparse long-history and rare-letter results are visible. Score both full turns and the first 24 initials.
- **Uncertainty:** paired bootstrap differences with 2,000 fixed-seed resamples, clustered by AAC message and whole Turk dialogue. Include source-balanced confidence intervals. AAC worker IDs are not exposed in these text files, so message resampling does not establish worker-level uncertainty; shared Turk contributors may also introduce dependence.

Provisional offline promotion gate: at least 0.10 bits/initial improvement over the strongest unigram on balanced unseen-text development loss, a paired 95% interval favoring PPM, and no per-source point regression greater than 0.05 bits/initial. Label these engineering decision thresholds, not established usability requirements. Do not expand the grid after seeing final tests.

If the gate fails, stop before integration and report the negative result. Data/parser fixes may restart development under a new protocol version. They are not a reason to consume COMM2 during tuning.

### 3. Freeze and final test

For the user's requested offline-only evaluation, freeze after development and exported-lookup parity checks, then score AAC test, Turk test, and COMM2 with the same baselines, novelty definitions, and metrics. Engine reachability and gaze checks remain separate future gates; this changes the initial ordering without claiming those checks passed. Do not train on COMM2, its vocabulary list, or its supplied unigram model. COMM2 IDs/text format is documented in its [README](https://aactext.org/comm2/comm2/readme.txt); do not assume IDs reveal workers or scenario groups without confirming metadata.

Make COMM2 the external-domain gate: the frozen PPM must improve on both uniform and the frozen strongest unigram, with a paired 95% interval favoring it over unigram. Require no worse than 0.05 bits/initial regression versus unigram on either original source's unseen-text final subset. Report all outcomes together, including failures, sample sizes, and overlap rates. If metadata permits scenario grouping, bootstrap whole scenarios and report scenario-specific results; otherwise acknowledge that message intervals omit dependence among responses to the ten shared situations.

A failed final test is a failed frozen candidate. Keep COMM2 as a regression benchmark thereafter, but any iteration informed by that result needs new untouched data for a fresh confirmation claim. Do not repeatedly tune against it and continue calling it an unseen test.

### 4. Export and engine validation

Export immutable context distributions with backoff links or suffix lookup, alphabet order, start-marker policy, source weights, maximum history, estimator constants, floor, tokenizer version, training hashes, and model hash. Precompute offline for observed contexts only, including lower-order/start contexts; do not enumerate `26^10` possibilities or train at startup. Export only the winning model and notices. Recompute held-out losses through the exported lookup to verify parity before integration; final tests cannot select a different candidate.

Use the existing predictor/engine boundary, preserving each entered branch's weights and ancestor snapshots for reversal. Activate a new asset or experimental condition only while paused. Runtime reads cached distributions; no training, provider calls, or worker round trip per frame. A worker is justified for loading only if measured startup parsing requires it.

Proposed budgets on the reference Mac: serialized asset at most 10 MB uncompressed, loaded model heap at most 50 MB, warmed lookup p95 below 1 ms, and sample-to-visible-feedback p95 below the PRD's 50 ms target. Measure artifact bytes, parse time, heap increase, cold/warm lookup, and the engine together; a file-size estimate is not a measurement.

Run synthetic steering through every initial after high-confidence, unseen, and long histories, including `q`, `x`, and `z`; test reversal, reseeding after locked-word edits, undo, pause/resume, and condition changes. A positive floor does not prove that a region can be reached. Use fixed viewport, speed, input/noise policy, and timeouts across conditions. Compare synthetic completion/reversal counts and time distributions, recording failure and timeout rates. Synthetic or mouse success does not establish gaze usability.

### 5. Human interaction judgment

Counterbalance uniform, unigram, and PPM with matched held-out phrases and practice on the same tracker/settings. Include ordinary social conversation, practical requests, unfamiliar names/topics, deliberate correction, and reversals. Measure time per entered initial, complete-message time, errors, reversals, failures, and user preference. Keep the phrase generator fixed so its performance does not confound the navigation comparison.

Treat the PRD's same-tracker improvement target as a provisional experiment target. Do not make PPM the default based only on offline loss or one developer's mouse trace. A controlled gaze trial should improve completion time without worse communication success or uncorrected errors before supporting a usability claim. Raw user language/gaze retention remains separately opt-in.

## Implementation deliverables and repeatable run

The implemented offline commands use the existing Node/TypeScript tooling and tests; no ML framework or inference service is needed. See the [run instructions and results](./initials-ppm-results.md) for `npm run ppm -- prepare|train|test|report`. Acquisition/parsing, pure PPM/count training, scoring/export, and the [renderer adapter](./initials-ppm-integration.md) remain separate:

1. **Prepare:** fetch pinned sources and validate schemas; produce manifests, split records, exclusion/overlap summaries, and token statistics. Prepare COMM2 only in the final-test stage.
2. **Fit and validate:** train the declared candidates, score development data, and write a machine-readable metrics file plus selected configuration. Fail promotion if the declared gate fails.
3. **Freeze and export:** write the selected artifact and protocol/model hashes; verify frozen-lookup parity. Engine reachability is deferred until integration work.
4. **Final test:** score the frozen artifact once against final sets and emit a report with paired differences and confidence intervals. The evaluator must not modify the model or selected settings.
5. **Integrate and exercise:** expose a paused-only experimental condition, verify engine/error recovery in Electron, then collect the gaze comparison. Reproduce a run from source hashes, protocol version, code revision, selected settings, and bootstrap seed.

Do not silently retrain from downloaded updates, add personal messages to this public corpus, ship the test sets in the renderer, or call a design gate a measured result.

## Judgments

**Proceed with the offline PPM experiment.** Its next-initial distribution matches the action Dasher needs, and the app already contains a related PPM implementation. An immutable exported model can keep runtime simple and deterministic. The training work is small; the important work is boundary handling, evaluation, and practical reachability.

**Expect most useful evidence at short histories.** Ten-initial capacity is reasonable to test, but the audit shows little repeated support beyond six. PPM can back off safely; retaining more history does not create evidence for meaningful long-context behavior. Prefer the shortest statistically competitive cap.

**The data is suitable for a prototype, with limited representativeness.** Combining AAC-like requests and dialogue turns is a better hypothesis than book language for this use case, but these sources remain old, invented, and sometimes repetitive. Initials remove lexical identity and meaning, so even good PPM results will not establish contextual personalization or word expansion. COMM2 is a useful different collection, not independent evidence from actual AAC users.

**The first offline result supports an engine experiment.** The frozen history-two model beats the tuned unigram on every held-out source, with a small asset and fast local lookup. Region reachability and gaze benefit remain unmeasured; the unlikely-letter probability tail worsens on COMM2, so a gain in bits remains insufficient if narrow regions slow communication. See the results document for measured values and limitations.
