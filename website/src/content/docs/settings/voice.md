---
title: Voice settings
description: Voice choice and preview, speaking speed, volume, delivery tone, Jev tone suggestions, and the microphone on the Voice tab.
sidebar:
  order: 3
---

The **Voice** tab in **Menu → Settings → Voice** controls how SpeakEasy speaks your confirmed messages and which microphone it listens with for conversation context. Speech and transcription use Cartesia, so most of this tab needs a `CARTESIA_API_KEY`. Without one, the tab shows "Set CARTESIA_API_KEY in .env and restart SpeakEasy." See [Cloud features](../../getting-started/cloud-features/).

SpeakEasy only speaks when you choose **Speak** or **Preview voice**. Audio is sent to Cartesia for transcription; SpeakEasy does not save recordings. All settings on this tab are remembered across restarts.

## Suggested delivery

This section controls the optional Jev tone suggestion. It is separate from Gemini phrase generation.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Suggest tone with Jev** | When on, Jev reads your ready-to-speak message and up to eight recent conversation turns and suggests a delivery tone. It receives no audio, camera frames, or saved memories. When on, the button reads **Turn off Jev tone suggestions**. Only available when `TYPESAFE_AI_API_TOKEN` is configured. | Off | On, Off |

A suggestion never changes your wording. The suggested tone appears beside **Speak**, where you can review it and choose a different one before speaking. A status line shows **Suggested by Jev**, **Jev uncertain · neutral** (Jev was not confident, so the tone stays neutral), **Choosing tone…**, or **Manual tone**. If Jev is unavailable, choose a tone yourself; manual tone selection always works.

## Voice

The section heading shows the current voice, for example **Voice · Cole Evolved**. The list of voices only appears when Cartesia is configured.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| Voice buttons | Each button is a Cartesia preset voice. Choose one to make it your voice. Six voices are shown at a time. | Cole Evolved | The preset voices Cartesia returns |
| **Previous voices** / **Next voices** | Pages through the voice list. | - | - |
| **Preview voice** | Speaks a short sample sentence with the current voice, speed, volume, and delivery tone. Disabled while speech is playing or when Cartesia is not configured. | - | Action |
| **Stop speech** | Stops the preview or any speech that is playing. | - | Action |

Use **Preview voice** after changing the voice, speed, or tone to hear the result before you speak to someone.

## Speech and microphone

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Speaking speed** | How fast the voice speaks. | **Normal** | **0.6×**, **0.8×**, **Normal**, **1.2×**, **1.5×** |
| **Playback volume** | How loud SpeakEasy plays speech, relative to your system volume. | **100%** | **0%**, **25%**, **50%**, **75%**, **100%** |
| **Delivery tone** | The tone used when no Jev suggestion applies. Choosing a tone here also sets the tone for the message you are currently writing. | **Neutral** | **Neutral**, **Calm**, **Happy**, **Excited**, **Sad** |
| **Microphone** | Chooses the input that SpeakEasy listens with for conversation transcription. | **System microphone** | **System microphone** and the microphones your computer reports |

Below these controls, a status line shows whether SpeakEasy is listening, and a live transcript line shows partner speech as it is heard. Finalized speech appears in the conversation on the [Gemini tab](../gemini/). Listening pauses while SpeakEasy speaks and resumes automatically after playback, so partner speech that overlaps your speech is not captured.

Choose a different **Microphone** if the transcript stays empty while someone is talking, or if it picks up the wrong room. If you want speech without transcription, deny SpeakEasy microphone access in your operating system's privacy settings. On macOS this is **System Settings → Privacy & Security → Microphone**.

The tab also names the models in use: English speech output with Sonic 3.6, and Ink 2 transcription.

For what Cartesia and Jev receive, see [Your data](../../privacy/data/).
