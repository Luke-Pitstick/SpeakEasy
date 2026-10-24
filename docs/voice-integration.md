# Cartesia voice integration

SpeakEasy uses `sonic-3.6` for streamed speech and `ink-2` for continuous partner transcription. The main process loads `CARTESIA_API_KEY` from the environment or the checkout `.env`; credentials and provider connections never enter the renderer. The packaged app excludes `.env`, so its key must be supplied separately through the environment. No speech requests automatically retry.

## Conversation contract

Microphone capture begins automatically after configuration and OS permission, with no routine Start/Stop listening control. A status indicator reports connection and permission failures. Transient failures reconnect with bounded exponential delay. The microphone uses an AudioWorklet to send 100 ms mono PCM blocks through validated IPC; raw recordings are not saved by SpeakEasy.

Partial Ink transcripts stay in the live display. Finalized turns queue while the user steers or dwells, then dispatch `conversation-add` with `speaker: 'partner'`. The existing composition reducer retains eight recent turns, invalidates old request revisions, and refreshes an existing expansion using the new context. No model is called for every audio chunk. Utterances over 1,000 characters split at word boundaries within the eight-turn budget. These are conversation partners collectively; speaker diarization is not implemented.

`contextEpoch` increments on Clear conversation. The voice hook discards queued and partial text and resets the transcription connection; late events from old connections cannot restore cleared context. Conversation text is session-only. Gemini receives it only when its existing cloud setting is enabled.

## Local microphone filtering (2026-10-24)

Capture uses a 48 kHz AudioContext and RNNoise on an AudioWorklet before PCM is sent to Cartesia. Browser noise suppression is disabled to avoid stacking denoisers; echo cancellation and automatic gain remain enabled. The mono output blends 75% RNNoise with 25% original audio. The original is delayed by 992 samples (about 20.7 ms), matching this pinned wrapper's 512-sample buffering and RNNoise's 480-sample algorithmic delay. There is no amplitude gate, voice-activity cutoff, or discarded quiet frame. Keeping original audio deliberately trades some noise rejection for preservation of speech the model suppresses; it does not guarantee recognition of quiet words or separation of competing speakers.

`@sapphi-red/web-noise-suppressor` is pinned to 0.4.1 (MIT), using its bundled `@shiguredo/rnnoise-wasm` 2022.2.0 (Apache-2.0) and Xiph RNNoise (BSD-3-Clause). Worklet and scalar/SIMD WASM assets ship locally through Vite; filtering adds no remote download, provider, or saved recording. Upstream license texts are in `resources/licenses/` and included in packaged resources. Sources: [wrapper](https://github.com/sapphi-red/web-noise-suppressor), [WASM binding](https://github.com/shiguredo/rnnoise-wasm), [RNNoise](https://github.com/xiph/rnnoise).

Synthetic tests execute the actual bundled WASM and verify 992-sample alignment, retained quiet input when the denoiser output is zero, and continuous 100 ms PCM blocks. Low-frequency rumble energy falls by more than 3 dB in the fixture; broadband white noise improves only modestly (about 0.85 dB). These results are not speech-recognition accuracy measurements. Lifecycle tests cover model-load failure, cancellation during loading, resource cleanup, and rejection of late audio. Real quiet conversation in a noisy room still needs a before/after transcription comparison.

## Speech and settings

Settings → Voice contains public English presets, explicit preview, speed (0.6–1.5), local playback volume, neutral/calm/happy/excited/sad delivery, and microphone selection. Settings persist in `voice-settings.json` in Electron userData. The current release uses English speech output; it does not claim a translated or multilingual composition experience.

Only Speak or Preview sends a validated immutable text/settings snapshot to Cartesia. Plain-text drafts containing angle brackets are rejected with an explanation because Cartesia interprets inline tags as controls; text is never silently rewritten. Neutral is sent explicitly. Sonic controls are guidance; subjective emotional accuracy still requires user listening evaluation.

Audio streams as 24 kHz float PCM, queues in Web Audio, and is cancelled locally and remotely on Stop. Late chunks cannot restart stopped audio. Completed speech enters the conversation as `me`; interrupted playback is explicitly marked with the full intended message, rather than represented as fully heard. Voice previews never enter conversation history. The draft remains unchanged.

Microphone transmission stops during generation/playback and resumes automatically after a short tail delay to avoid self-transcription. Partner speech overlapping playback is not captured. SpeakEasy itself saves no recordings, but audio is transmitted to Cartesia under that provider's policies.

## Validation (2026-10-24)

- Filtering increment: 18 targeted voice/audio tests, lint, TypeScript, and production build passed. The reloaded Electron development app reached “Listening to conversation”; its console showed no audio-filter errors. This is an initialization check, not a real-room quiet-speech accuracy test.

- Automated provider-boundary, audio queue/cancellation, auto-listening, partial/final context, and context-clear tests pass.
- Full suite: 110 tests passed; TypeScript and production build passed. Final lint checked separately.
- Live key/voice-list request succeeded. Sonic generated the fixed fixture “Would you like coffee or tea?” with first audio in 444 ms on one request; Ink transcribed it exactly. This synthetic loop is not a real-person microphone accuracy measurement.
- Built Electron app: automatic listening status, populated Voice tab, preview playback state, Stop, and automatic listening resumption verified through the native UI. No real eye-gaze or subjective tone-accuracy validation is claimed.

References: [Cartesia SDK](https://github.com/cartesia-ai/cartesia-js), [Sonic 3.6](https://docs.cartesia.ai/build-with-cartesia/tts-models/latest), [Ink 2](https://docs.cartesia.ai/build-with-cartesia/stt/latest), [delivery controls](https://docs.cartesia.ai/build-with-cartesia/capability-guides/volume-speed-emotion).
