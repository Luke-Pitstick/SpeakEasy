# Initials PPM offline results

Run: `f70020135ab3a402`. Model SHA-256: `2780b90e230892ba92fd8c2c16053c8d61558595a1a92b2247b48ee02d5171ba`.

Frozen configuration: maximum history 2, AAC weight 0.5, uniform mixture 0.1.

Development promotion gate: **PASS**. Final offline gate: **PASS**.

Lower bits per initial means more probability on the intended next letter. It does not measure typing speed.

| Split, unseen full text | Initials | Uniform bits | Unigram bits | PPM bits | PPM top-3 | Improvement vs unigram, 95% CI |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| aac dev | 2510 | 4.700 | 4.127 | 3.797 | 45.3% | See balanced development comparison below |
| aac test | 2264 | 4.700 | 4.168 | 3.891 | 41.8% | 0.276 [0.229, 0.322] |
| turk dev | 12204 | 4.700 | 4.176 | 4.044 | 36.7% | See balanced development comparison below |
| turk test | 12359 | 4.700 | 4.172 | 4.047 | 36.3% | 0.125 [0.106, 0.144] |
| comm2 test | 11455 | 4.700 | 4.123 | 3.852 | 42.3% | 0.271 [0.250, 0.291] |

Balanced development improvement: 0.231 bits/initial; 95% CI [0.207, 0.253].

Full splits, unseen-initial-string subsets, first-24 targets, per-position and per-letter metrics are in development.json and final.json. Intervals use 2,000 paired bootstrap resamples, grouping Turk turns by dialogue; AAC/COMM2 use messages, which does not account for unexposed worker/scenario dependence.

Training repeats are retained. No test/development refit or online updates were performed. COMM2 was acquired only after freezing. Dataset sources are crowdsourced invented messages, not naturally occurring AAC conversations.

This artifact is for local review. Current dataset pages list CC BY 4.0; older Turk/COMM2 READMEs list BY-ND. Resolve that discrepancy before distribution. Dasher integration, engine reachability, and gaze trials remain outstanding.
