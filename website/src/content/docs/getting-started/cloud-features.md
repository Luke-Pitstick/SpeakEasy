---
title: Cloud features
description: Which credentials turn on phrase suggestions, speech, transcription, and tone suggestions, and how to supply them.
sidebar:
  order: 4
---

Steering, exact spelling, correction, and undo work with no accounts. Phrase suggestions, speech, conversation transcription, and tone suggestions use cloud services, and each one needs its own credentials. Before you add any, read [What leaves your device](../../privacy/data/).

## Which credentials enable which feature

| Feature                                      | Credentials                                                     | How to turn it on                                                                 |
| -------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Phrase suggestions, replacements, completions, and automatic memory learning | `OPENROUTER_TOKEN`, `MOSS_PROJECT_ID`, and `MOSS_PROJECT_TOKEN` | **Menu → Settings → Gemini → Enable Gemini**                                        |
| Speech (**Speak** and **Preview voice**)      | `CARTESIA_API_KEY`                                              | On as soon as the key is set                                                      |
| Conversation transcription                   | `CARTESIA_API_KEY`, plus microphone permission                  | Starts automatically when the key is set and microphone access is allowed         |
| Tone suggestions                             | `TYPESAFE_AI_API_TOKEN`                                         | **Menu → Settings → Voice → Suggest tone with Jev**                                 |

Phrase suggestions need all three of the first set. `OPENROUTER_TOKEN` is an OpenRouter API key. `MOSS_PROJECT_ID` and `MOSS_PROJECT_TOKEN` are your Moss project ID and project key; Moss finds relevant earlier conversation and saved facts. With an OpenRouter key but no Moss credentials, a suggestion request fails with "Memory context unavailable. Check Moss credentials and connection, then retry."

`TYPESAFE_AI_API_TOKEN` is the API token for Jev, the TypeSafe decision model.

## Supply credentials

SpeakEasy reads credentials once, when it starts. Restart the app after you add or change one. If a variable is set both in the environment and in `.env`, the environment value wins.

### Source checkout

Create a file named `.env` at the root of the repository, next to `package.json`, and add only the lines you need:

```sh
OPENROUTER_TOKEN=your-openrouter-key
MOSS_PROJECT_ID=your-moss-project-id
MOSS_PROJECT_TOKEN=your-moss-project-key
CARTESIA_API_KEY=your-cartesia-key
TYPESAFE_AI_API_TOKEN=your-typesafe-token
```

The repository's `.gitignore` already excludes `.env`. Keep keys out of commits, screenshots, and issue reports.

### Packaged builds

Installers do not include or read a `.env` file. Set the variables in the environment of the process that launches SpeakEasy, for example by exporting them in a terminal and starting the app from that terminal. An app started from the Dock, Start menu, or a desktop launcher usually does not inherit variables set in a terminal.

## Turn each feature on

### Phrase suggestions (Gemini)

1. Set the three OpenRouter and Moss variables and restart.
2. Open **Menu → Settings → Gemini**. The status line shows the phrase model and "API key configured".
3. Select **Enable Gemini**. The choice is saved and stays on after a restart.

Suggestions use `google/gemini-3.8-flash` through OpenRouter by default. **Choose phrase model** lets you pick another OpenRouter model; pricing and speed vary by model. When Gemini is off, **Show phrases** can still show saved phrases that match your initials, but it does not request new ones.

With Gemini on, SpeakEasy also learns preferences and personal facts from messages you confirm. See [Gemini settings](../../settings/gemini/) for the memory controls.

### Speech and transcription (Cartesia)

1. Set `CARTESIA_API_KEY` and restart.
2. Allow microphone access when asked. If you do not want transcription, deny microphone access; speech still works.
3. Open **Menu → Settings → Voice**, pick a voice, and choose **Preview voice** to hear it.

Speech uses Cartesia Sonic 3.6 and transcription uses Cartesia Ink 2. The microphone status beside the message reads **Listening** when transcription is running. There is no separate on/off switch for transcription. See [Voice settings](../../settings/voice/).

### Tone suggestions (Jev)

1. Set `TYPESAFE_AI_API_TOKEN` and restart.
2. Open **Menu → Settings → Voice** and select **Suggest tone with Jev**. It is off by default.

When a message is ready to speak, Jev suggests one of Neutral, Calm, Happy, Excited, or Sad in the **Delivery tone** control beside **Speak**. The suggestion never changes your wording, and you can choose a different tone before you speak.
