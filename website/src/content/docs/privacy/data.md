---
title: What leaves your device
description: What SpeakEasy keeps on your computer, and exactly what each cloud provider receives and when.
sidebar:
  order: 1
---

SpeakEasy keeps camera processing, storage, and credentials on your computer. Data leaves the device only through the cloud features you set up: OpenRouter and Moss for phrase suggestions, Cartesia for speech and transcription, and Jev for tone suggestions. With no credentials configured, SpeakEasy makes no provider requests. SpeakEasy itself has no analytics or telemetry.

## What stays on your device

| Data | Where it lives | Notes |
| --- | --- | --- |
| Webcam frames | Memory only | Processed on-device by a local face model. Frames are never saved or sent anywhere, including to the debug window. |
| Gaze calibration, input choice, camera choice | The app's local browser storage | Calibration is stored as eye-feature samples, not images. |
| Confirmed messages, saved facts, and their conversation context | `preferences.sqlite` | Saved when you choose a phrase, lock a sentence, or select **Speak**. Each saved message keeps up to eight conversation turns from when you confirmed it, so learning can be retried later. Up to 20,000 messages and 2,000 facts. |
| Learned corrections | `memory.sqlite` | Saved only when **Learn my corrections** is on. Off by default. Up to 2,000 corrections. |
| Saved phrases | `phrase-cache.json` | Phrases you have used, matched to their initials. **Clear saved phrases** removes them. |
| Settings | `settings.json`, `voice-settings.json` | General, Gemini, and voice settings. |
| Session conversation | Memory only | Up to 500 finalized turns and 250,000 characters. Gone when you close the app or choose **Clear conversation**. Partial transcripts and suggestions you did not select are not added. |
| Debug trace | Memory only | Only while **Open conversation debug window** is open. Closing the window deletes it. |
| Credentials | Your `.env` file or environment | Read by the main process only. Never passed to the app interface. |

The files are in Electron's user data folder for SpeakEasy. The databases and JSON files are readable and writable only by your user account, and the databases use SQLite secure deletion. SpeakEasy does not encrypt them, back them up, or sync them. Backups made by your operating system are outside the app's control, so deleting a record in SpeakEasy does not remove it from those backups.

## What each provider receives

| Provider | When | What it receives |
| --- | --- | --- |
| **OpenRouter** (phrase model, `google/gemini-3.8-flash` by default) | Only while Gemini is enabled, when you request suggestions, replacements, or completions | Your initials, spelled words, and locked sentences; the current draft; the eight most recent conversation turns; relevant earlier turns chosen by Moss; matching saved facts if **Use saved facts in suggestions** is on; and learned vocabulary and examples if **Use memory in Gemini** is on. |
| **OpenRouter** (context selection) | With the suggestion requests above | Recent conversation turns and earlier turns retrieved by Moss, used to pick relevant context. It does not receive saved fact values. |
| **OpenRouter** (memory learning) | While Gemini is enabled, after you confirm a message | That message and up to eight relevant conversation turns, to identify your preferences and personal facts. |
| **OpenRouter** (model list) | When you open **Choose phrase model** | A request for the public model catalog. No credentials or conversation text. |
| **Moss** | While Gemini is enabled | Moss searches conversation and saved facts locally, in temporary indexes that are not uploaded or saved. It contacts its service for authentication and model loading and sends usage telemetry, including device identifiers. Moss documents that this telemetry excludes query and document text. |
| **Cartesia** (speech) | Only when you select **Speak** or **Preview voice** | The exact text, voice, speed, and tone. Voice listing also uses your key. |
| **Cartesia** (transcription) | Continuously, whenever a Cartesia key is set and microphone access is allowed | Live microphone audio, after local noise filtering. Sending pauses while SpeakEasy is speaking. SpeakEasy does not save recordings. |
| **Jev** (TypeSafe) | Only if **Suggest tone with Jev** is on, when a message is ready to speak | The message you are about to speak and up to eight recent conversation turns. No saved facts, audio, or camera data. |

No provider receives webcam frames or gaze data. Each provider handles what it receives under its own policies.

## Limits to know about

- **Transcription has no on/off switch.** If you set a Cartesia key for speech, transcription starts too. To use speech without it, deny SpeakEasy microphone access.
- **Saved facts are shared by default.** **Use saved facts in suggestions** starts on. Turn it off in **Menu → Settings → Gemini** to keep facts local.
- **Learning is automatic with Gemini on.** Preferences and personal facts from your confirmed messages are saved without asking. You can review, edit, and forget them in **Menu → Settings → Gemini**.
- **Conversation is not fully session-only.** The live conversation is cleared when you close the app, but up to eight turns are saved with each confirmed message. **Forget this sentence and its facts** and **Forget all preference facts and sentences** remove them.
- **Partner speech is context, not your preferences.** SpeakEasy is designed not to learn your preferences from what your partners say or from suggestions you did not choose, but model extraction is not guaranteed to be accurate.

To manage or delete saved data, see [Gemini settings](../../settings/gemini/).
