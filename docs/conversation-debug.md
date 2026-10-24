# Conversation context and expansion debugging

Open **Menu → Settings → Open conversation debug window** in the desktop app. The separate window captures diagnostics only while open. It shows the current draft/initials, unfinished preceding sentences, recent speaker-attributed turns, older summary, pending summary turns, partial transcription, finalized transcripts waiting for an interaction boundary, and microphone status.

The history contains the exact generation request and model, semantic retrieval query and cache use, matching facts and similarity scores, correction vocabulary/examples actually sent, raw candidate lines with acceptance/rejection reasons, final results, and cancellation events. Expand entries sharing a request ID to follow one expansion. Previous context snapshots remain inspectable. No reasoning traces, credentials, audio, or camera frames are recorded.

History is bounded to 150 events, with each event capped at 50,000 characters, and stays in process memory. Clear debug history deletes it; closing the debug window disables capture and deletes its contents. Conversation reset and memory edits/deletions also invalidate captured history. A Zod schema validates renderer context updates, and IPC checks restrict opening/context updates to the main window and reads to the inspector. The inspector does not mount the composition, camera, or microphone hooks.

## How context reaches an expansion

Cartesia finalizes partner speech after its turn detector concludes the turn. The configured maximum silence wait is now 1,200 ms, replacing the provider's 5,600 ms default. This reduces delayed context but may split speech at longer pauses. Partial text remains visible in diagnostics; it is never silently treated as a finalized question. Final turns queue while writing or dwelling, then enter conversation at a safe boundary. If an unaccepted expansion already exists, finalized partner context refreshes it. Accepted text remains unchanged.

With cloud generation enabled, any current conversation, historical summary, or unfinished locked message prevents initials-only cached phrases from occupying candidate slots without contextual generation. Offline/no-context cache use remains available. The prompt supplies literal initials, numbered word constraints, the latest partner question, and the last user message alongside the conversation. It asks for the appropriate tense, topic-specific subjects/reasons, and natural alternative wording; current authored-message priority still takes precedence over unrelated background speech.

Every model line passes the same strict local word/initial validator. When fewer than three choices survive, or rejected lines leave slots open, generation makes at most one repair request using the same model and low reasoning. The repair receives rejected text, the exact slots, and accepted wording to avoid duplication. It can append choices but cannot rewrite or reorder existing choices. Both attempts share the original 12-second timeout. Complete valid candidates remain available with an error notice if a later request fails; an unfinished last line is never accepted.

## Verification

The synthetic school regression uses the question “What was your least favorite subject when you were in school?”, `idlm`, the accepted reply “I didn't like math,” and the partner follow-up “What's wrong with math? It's not that hard.” followed by `ittitc`. A live run returned six choices for each input, including “I didn't like math” first and “I think trigonometry is too confusing” in the follow-up. Earlier probes exposed extra-word failures such as “I think **that** trigonometry is too confusing”; strict validation rejected those instead of showing mismatched phrases.

Run the paid synthetic regression explicitly:

```sh
SPEAKEASY_LIVE_SCHOOL_TEST=1 npm exec vitest run tests/school-context-live.test.ts
```

Local tests cover safe transcript handoff, complete conversation on the follow-up, a bounded repair with stable candidate identities, contextual cache exclusion, debug IPC authorization, bounded opt-in storage, deletion, and debug-window rendering/filtering. These tests do not establish microphone recognition accuracy in a real room, broad grammatical accuracy, or reliable prediction of one exact intended phrase on every run.
