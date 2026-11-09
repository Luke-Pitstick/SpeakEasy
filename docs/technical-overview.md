# SpeakEasy technical overview

Based on the working checkout on October 25, 2026. “Dasha” refers to **Dasher**; “Mox” is interpreted here as **Moss**, the search library used in the app.

## How the pieces fit together

SpeakEasy is an Electron desktop app with a React/TypeScript interface. The renderer handles composition, Dasher navigation, microphone capture, and audio playback. The main process owns databases, credentials, and provider connections; a typed preload/IPC bridge connects them.

The communication flow is **enter initials → retrieve context and memories → generate candidate sentences → select/edit → explicitly Speak**. OpenRouter handles sentence generation, with `google/gemini-3.8-flash` as the configured default and a phrase-model picker. Candidates are checked against initials, prefixes, and locked words. Request IDs and composition revisions reject stale responses; predictions cannot directly change accepted text or trigger speech.

## Memory: what persists

**Personal memory** stores confirmed sentences, preferences, and personal facts in local `preferences.sqlite`. Accepting a phrase, locking a sentence, or confirming speech can commit text before playback. With generation enabled, an OpenRouter extraction request uses that sentence and bounded conversational evidence to identify facts such as a favorite food, a name, or a family relationship. Zod validates the structure and grounding quotes; partner speech supplies context but must not become a fact about the user.

Sentences and extraction jobs are saved transactionally before the network call, so unfinished authorized work can resume after restart. A separate “Use saved facts in suggestions” permission controls retrieval into cloud prompts and defaults on for new databases. The database has restricted file permissions, but no application-level encryption or cloud synchronization.

**Correction memory** separately stores explicitly accepted wording corrections in `memory.sqlite`. It retrieves vocabulary and corrected examples using lexical matches to initials, prefixes, and current context. Learning and cloud use have separate switches, both initially off. A separate saved-phrase cache also supports reuse without regenerating every phrase. These mechanisms do not retrain Dasher.

Sources: [personal memory](../src/main/preferenceService.ts), [SQLite storage](../src/main/preferenceStore.ts), [correction memory](correction-memory.md).

## Context: what the current message means

The renderer retains up to 500 finalized conversation turns, bounded to 250,000 characters. This archive is session-only; selected question context is also persisted alongside committed sentences for memory extraction. Partial microphone transcripts and unselected suggestions are excluded from the finalized archive.

For generation, Moss searches earlier turns, then an OpenRouter context resolver selects up to eight relevant evidence turns and identifies the topic, time frame, reply intent, vocabulary, and memory-search query. Explicit words and locked constraints take priority. An unfinished authored message anchors its own topic so unrelated background speech should not redirect it. The context decision is reused across initials-only edits, reducing repeated model calls.

## Moss: finding relevant evidence

Moss is the retrieval layer; SQLite remains the persistent source of truth. The app creates two disposable local Moss sessions: one for conversation turns and one for permitted saved facts. Its default `moss-minilm` embedding model supports semantic matching, combined with keyword matching at `alpha: 0.6`—a 60/40 blend. See the provider’s [session](https://docs.moss.dev/docs/reference/js/sessions) and [hybrid-search](https://docs.moss.dev/docs/reference/js/hybrid-search) documentation.

The app filters retrieved facts for scope, polarity, and relevance, prioritizes matching relationships, and passes at most three facts within 1,800 JSON characters to generation. Uncertain queries return no facts. Edits and deletion invalidate derived retrieval state and pending results.

These indexes are neither uploaded nor saved to disk by this integration. Moss still requires service authentication/model setup and sends usage/device telemetry, which its SDK documents as excluding query and document text. Selected evidence can separately leave the device through OpenRouter. See [the implementation](../src/main/mossMemory.ts) and [Moss telemetry policy](https://docs.moss.dev/docs/reference/telemetry).

## Dasher’s PPM: predicting the next initial

PPM means **Prediction by Partial Matching**. It assigns probabilities to the next symbol from recent symbol history, backing off to shorter histories when evidence is sparse. Dasher uses those probabilities to allocate more space to likely letters while retaining access to alternatives. It runs synchronously and locally during steering.

Initials mode uses a frozen model trained on AAC-like messages and Turk dialogues. The selected configuration uses at most **two preceding initials**, equal source weighting, and **10% uniform smoothing**, which gives every letter a positive probability. Locked words contribute their initials; saved personal facts and conversation history do not. The app separately reserves space for `!` and `?`.

Exact spelling uses a separate character PPM with up to four preceding characters, prepared from a small authored demonstration corpus. Neither predictor learns online. PPM predicts letters; OpenRouter expands the resulting initials into sentences. Offline prediction improvements do not establish faster real gaze entry. Sources: [predictor](../src/renderer/src/features/dasher/prediction.ts), [training and evaluation](initials-ppm-results.md).

## Cartesia: listening and speaking

Cartesia supplies both **Ink 2 speech recognition** and **Sonic 3.6 speech synthesis** in the current configuration. Microphone audio passes through local RNNoise filtering, blended with some original audio, then streams to Ink. Final transcripts become partner context; partial transcripts remain display-only. Listening starts after configuration and OS permission, and microphone transmission pauses during generated speech to avoid transcribing the app itself.

An explicit Speak or Preview sends an immutable snapshot of text, voice, speed, and tone to Sonic through the main process. The app consumes streamed audio using [`tts.generateSSE`](https://github.com/cartesia-ai/cartesia-js), decodes 24 kHz floating-point PCM, and queues it for Web Audio playback. Stop cancels generation and playback, and late chunks are ignored. Optional Jev tone suggestions are a separate decision integration; the user can override them before speaking. Sources: [Cartesia adapter](../src/main/cartesia.ts), [voice integration](voice-integration.md).
