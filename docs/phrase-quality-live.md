# Live phrase quality comparison — October 24, 2026

Tested the updated initials prompt through the app's actual streaming and candidate validation path, with synthetic conversations, empty memory/cache, temperature 0, reasoning disabled, and up to six suggestions. The Qwen run substitutes only the outgoing model ID. Provider labels inside the application contract still say Gemini; this experiment does not switch the application's configured model.

| Completed comparison run                                | Gemini 3 Flash Preview        | Qwen3.8 Flash      |
| ------------------------------------------------------- | ----------------------------- | ------------------ |
| Model ID                                                | google/gemini-3-flash-preview | qwen/qwen3.8-flash |
| Scenarios with at least one constraint-valid suggestion | 16/16                         | 10/16              |
| Ordinary scenarios with at least one suggestion         | 14/14                         | 10/14              |
| Accepted suggestions                                    | 66                            | 16                 |
| Raw nonempty lines                                      | 69                            | 29                 |
| Median final-result latency                             | 1.16 s                        | 1.01 s             |

These counts measure constraint compliance and availability, not grammatical correctness. Duplicate lines also get filtered. Latency measures the completed response, not time to first suggestion, and is from one small sequential run per model.

## Review

Both models can produce natural contractions and expression: “I don't know,” “I can't wait!” and “I'm so excited to see you!” appeared among accepted suggestions. Gemini also returned “I can't believe we did that!” and “That's so frustrating.” Qwen returned “Well, that was great.” in the failed-cake scenario, a plausible sarcastic reply.

Gemini's prompt is insufficient to ensure quality: accepted lines included “That's you so much!”, “I'm so excited to you!”, invented hyphenations such as “to-see,” unsupported names, and irrelevant replies such as “I'll wait a century” to a drink question. Its humor case included “What turned wrong, George?” and “What the world, Grace!” Local validation checks lexical constraints and cannot establish grammar or meaning.

Qwen's accepted phrases were mostly natural on review, but it frequently ignored initials or word counts. It returned “That's frustrating.” for tsf, “That's so much” for tysm, “I can barely wait to do that” for icbwdt, and an incomplete “I'm really appreciative at” in the prefix case; all were rejected. Six cases yielded no usable suggestion: frustration, gratitude, longer, prefix, and both tight-constraint stress cases. Qwen therefore is not a reliable drop-in replacement with this prompt. The app default remains Gemini; neither model has passed a broad quality evaluation.

The two tight-constraint cases omit a word from the likely intended reply: isety cannot represent “I'm so excited to see you,” and idtasgi cannot represent “I don't think that's a good idea.” Correctly specified counterparts are included separately. Empty output is preferable to malformed padding in stress cases; ordinary empty cases remain failures. No assumption is made that every initial sequence has a natural expansion.

An initial 14-case Gemini exploratory run exposed these issues. A first Qwen run stopped after the gratitude case produced no valid choices; the final run used soft assertions to record all cases. Thus the table is the two complete comparable runs, not every API call or an average across retries. The final Qwen run failed six nonempty-output assertions; the Gemini run passed them. Judgments here are a direct assistant review of the text, not a blinded human study or a model-generated quality score. Native UI and real-user gaze were not tested.

## Reproduce

Run the opt-in test with the configured OPENROUTER_TOKEN (environment or app-root .env):

```sh
rtk proxy env SPEAKEASY_LIVE_QUALITY_TEST=1 npm test -- tests/gemini-quality-live.test.ts
rtk proxy env SPEAKEASY_LIVE_QUALITY_TEST=1 SPEAKEASY_QUALITY_MODEL=qwen/qwen3.8-flash npm test -- tests/gemini-quality-live.test.ts
```

Each run writes raw text and accepted candidates to /tmp/speakeasy-live-quality.json, overwriting the previous run. These are paid live requests. Ordinary tests skip this test. [OpenRouter's Qwen model listing](https://openrouter.ai/qwen/qwen3.8-flash) confirms the model ID.

## Complete comparison outputs

### drink

Initials: iwac. Context: Would you like tea or coffee?.

Constraints: initial:i, initial:w, initial:a, initial:c.

**Gemini raw output**

```text
I want a coffee.
I'll wait a century.
I'd want a coffee.
I will accept coffee.
```

Accepted: "I want a coffee."; "I'll wait a century."; "I'd want a coffee."; "I will accept coffee.".

**Qwen raw output**

```text
I want a coffee.
I'd want a coffee.
I'll have a coffee.
```

Accepted: "I want a coffee."; "I'd want a coffee.".

### uncertainty

Initials: idk. Context: Do you know when the delivery will arrive?.

Constraints: initial:i, initial:d, initial:k.

**Gemini raw output**

```text
I don't know.
I didn't know.
```

Accepted: "I don't know."; "I didn't know.".

**Qwen raw output**

```text
I don't know.
I dunno.
I do not know.
```

Accepted: "I don't know.".

### anticipation

Initials: icw. Context: We got tickets to your favorite band tomorrow!.

Constraints: initial:i, initial:c, initial:w.

**Gemini raw output**

```text
I can't wait!
I can't win.
I certainly will!
```

Accepted: "I can't wait!"; "I can't win."; "I certainly will!".

**Qwen raw output**

```text
I can't wait!
I'm so excited!
I can hardly believe it.
```

Accepted: "I can't wait!".

### frustration

Initials: tsf. Context: The appointment was cancelled again after you waited all morning..

Constraints: initial:t, initial:s, initial:f.

**Gemini raw output**

```text
That's so frustrating.
That's simply frustrating.
That's super frustrating.
This seems frustrating.
That sounds frustrating.
```

Accepted: "That's so frustrating."; "That's simply frustrating."; "That's super frustrating."; "This seems frustrating."; "That sounds frustrating.".

**Qwen raw output**

```text
That's frustrating.
```

Accepted: (none).

### affection

Initials: ily. Context: I love you. I am glad we get to spend today together..

Constraints: initial:i, initial:l, initial:y.

**Gemini raw output**

```text
I love you.
I love you!
```

Accepted: "I love you.".

**Qwen raw output**

```text
I love you.
```

Accepted: "I love you.".

### gratitude

Initials: tysm. Context: I fixed your chair and brought your favorite lunch..

Constraints: initial:t, initial:y, initial:s, initial:m.

**Gemini raw output**

```text
Thank you so much!
That's you so much!
Thank you, so much.
That's your sweet move.
```

Accepted: "Thank you so much!"; "That's you so much!"; "That's your sweet move.".

**Qwen raw output**

```text
That's so much
```

Accepted: (none).

### boundary

Initials: idwtdt. Context: Would you like to go to the crowded party tonight?.

Constraints: initial:i, initial:d, initial:w, initial:t, initial:d, initial:t.

**Gemini raw output**

```text
I don't want to do that.
I don't wish to do that.
I don't want to dance tonight.
I don't want to drive there.
```

Accepted: "I don't want to do that."; "I don't wish to do that."; "I don't want to dance tonight."; "I don't want to drive there.".

**Qwen raw output**

```text
I don't want to do that.
I'd rather not do that.
I don't want to do this.
I'd hate to do that.
```

Accepted: "I don't want to do that."; "I don't want to do this.".

### excited

Initials: isetsy. Context: I will finally be visiting you this weekend after a year apart..

Constraints: initial:i, initial:s, initial:e, initial:t, initial:s, initial:y.

**Gemini raw output**

```text
I'm so excited to see you!
I'm so eager to see you.
It's so excellent to see you.
I'm so ecstatic to see you.
```

Accepted: "I'm so excited to see you!"; "I'm so eager to see you."; "It's so excellent to see you."; "I'm so ecstatic to see you.".

**Qwen raw output**

```text
I'm so excited to see you!
```

Accepted: "I'm so excited to see you!".

### excited-tight-constraints

Initials: isety. Context: I will finally be visiting you this weekend after a year apart..

Constraints: initial:i, initial:s, initial:e, initial:t, initial:y.

**Gemini raw output**

```text
I'm so excited to you!
I'm so excited to-see you!
I'm so eager to-see you!
I've so enjoyed thinking-of you.
```

Accepted: "I'm so excited to you!"; "I'm so excited to-see you!"; "I'm so eager to-see you!"; "I've so enjoyed thinking-of you.".

**Qwen raw output**

```text
I'm so excited to see you
```

Accepted: (none).

### humor

Initials: wtwg. Context: I tried to bake a cake and set off every smoke alarm in the house..

Constraints: initial:w, initial:t, initial:w, initial:g.

**Gemini raw output**

```text
What turned wrong, George?
Was the window glazed?
Was the wheat gluten?
Well, that was great!
What the world, Grace!
Was that whole grain?
```

Accepted: "What turned wrong, George?"; "Was the window glazed?"; "Was the wheat gluten?"; "Well, that was great!"; "What the world, Grace!"; "Was that whole grain?".

**Qwen raw output**

```text
Wow, that was good.
Well, that was great.
Wow, that's wild, girl.
```

Accepted: "Wow, that was good."; "Well, that was great."; "Wow, that's wild, girl.".

### longer

Initials: icbwdt. Context: We finally finished that impossible puzzle together!.

Constraints: initial:i, initial:c, initial:b, initial:w, initial:d, initial:t.

**Gemini raw output**

```text
I can't believe we did that!
I can't believe we're done then.
I can't believe we did this.
I can't believe we're done today.
I can't believe we finished that.
I can't believe we've done that.
```

Accepted: "I can't believe we did that!"; "I can't believe we're done then."; "I can't believe we did this."; "I can't believe we're done today."; "I can't believe we've done that.".

**Qwen raw output**

```text
I can barely wait to do that
```

Accepted: (none).

### practical

Initials: cypmtc. Context: Are you comfortable, or should I adjust something?.

Constraints: initial:c, initial:y, initial:p, initial:m, initial:t, initial:c.

**Gemini raw output**

```text
Can you please move that chair?
Could you please move the chair?
Can you please move this cushion?
Could you please move that chair?
Can you please move this chair?
Could you please move the cushion?
```

Accepted: "Can you please move that chair?"; "Could you please move the chair?"; "Can you please move this cushion?"; "Could you please move that chair?"; "Can you please move this chair?"; "Could you please move the cushion?".

**Qwen raw output**

```text
Could you please move that closer?
```

Accepted: "Could you please move that closer?".

### locked-contraction

Initials: idttagi. Context: Should we leave without telling anyone?.

Constraints: initial:i, word:don't, initial:t, initial:t, initial:a, initial:g, initial:i.

**Gemini raw output**

```text
I don't think that's a good idea.
I don't think they'd appreciate getting ignored.
I don't think they're all going in.
```

Accepted: "I don't think that's a good idea."; "I don't think they'd appreciate getting ignored."; "I don't think they're all going in.".

**Qwen raw output**

```text
I don't think that's a good idea
```

Accepted: "I don't think that's a good idea".

### locked-contraction-tight-constraints

Initials: idtasgi. Context: Should we leave without telling anyone?.

Constraints: initial:i, word:don't, initial:t, initial:a, initial:s, initial:g, initial:i.

**Gemini raw output**

```text
I don't think any secret's good, Ian.
I don't think anyone should go, Izzy.
I don't think a secret's good, Ivan.
I don't think a surprise's good, Iris.
I don't think a secret's great, Ivy.
I don't think a secret's good, Isaac.
```

Accepted: "I don't think any secret's good, Ian."; "I don't think anyone should go, Izzy."; "I don't think a secret's good, Ivan."; "I don't think a surprise's good, Iris."; "I don't think a secret's great, Ivy."; "I don't think a secret's good, Isaac.".

**Qwen raw output**

```text
I don't think anyone should go
```

Accepted: (none).

### prefix

Initials: iraat. Context: I stayed late to help you finish the paperwork..

Constraints: initial:i, initial:r, prefix:app, initial:a, initial:t.

**Gemini raw output**

```text
I really appreciate all that.
I really appreciate all this.
I really appreciate any time.
I really appreciate another task.
```

Accepted: "I really appreciate all that."; "I really appreciate all this."; "I really appreciate any time."; "I really appreciate another task.".

**Qwen raw output**

```text
I'm really appreciative at
```

Accepted: (none).

### no-context

Initials: ins. Context: (none).

Constraints: initial:i, initial:n, initial:s.

**Gemini raw output**

```text
I'm not sure.
It's not safe.
I need sleep.
It's nearly summer.
I noticed something.
I'm now starting.
```

Accepted: "I'm not sure."; "It's not safe."; "I need sleep."; "It's nearly summer."; "I noticed something."; "I'm now starting.".

**Qwen raw output**

```text
I'm not sure.
I never said.
It's no secret.
```

Accepted: "I'm not sure."; "I never said."; "It's no secret.".
