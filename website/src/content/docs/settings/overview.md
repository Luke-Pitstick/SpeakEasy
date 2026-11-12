---
title: Settings overview
description: How to open SpeakEasy settings, what each tab covers, and where your choices are saved.
sidebar:
  order: 1
---

SpeakEasy keeps all of its settings in one place: **Menu → Settings**. This page explains how to get there, what the three tabs hold, and which choices survive a restart.

## Open settings

1. Look at or click the **Menu** bar at the bottom edge of the window. With dwell on, hold your gaze there until it activates.
2. Choose **Settings**.
3. Choose a tab: **General**, **Voice**, or **Gemini**.

Choose **Back** at the top of the panel to close it. Pressing **Esc** also closes the menu and pauses writing.

Opening the menu pauses writing. When you close it, SpeakEasy resumes writing if you were writing before you opened it. Most changes on the General tab also pause writing, so a new value never takes effect in the middle of a steering movement.

## The three tabs

| Tab | What it covers |
| --- | --- |
| [**General**](../general/) | Input source, camera, eye tracker calibration, head pointer centering, pointer dot, appearance, steering speed, letter prediction, dwell, and edge target size. |
| [**Voice**](../voice/) | Jev tone suggestions, voice choice and preview, speaking speed, playback volume, delivery tone, and microphone. |
| [**Gemini**](../gemini/) | Cloud phrase generation, the phrase model picker, saved phrases, session conversation, correction memory, and saved facts and sentences. |

Above the tabs there is one more control, **Open conversation debug window**. It opens a separate window that captures context, transcriptions, and model results on this device while it is open. Closing the window deletes its trace. It is meant for troubleshooting, not everyday use.

## Using a mouse or keyboard during setup

Every setting can be changed with a mouse, and you can use the keyboard as well. This is the easiest way to set up SpeakEasy before your eye tracker or head pointer is working, or for a helper setting it up on your behalf.

Some settings open a grid of large buttons when you select them (for example **Steering speed**, **Camera**, and the Voice tab choices). These work with dwell, the same as every other button. Others are standard drop-down lists (for example **Input**, **Dwell activation**, and **Dwell time**), which are easier to change with a mouse or keyboard. See [Input setup](../../getting-started/input-setup/) for a step-by-step walkthrough.

## Where settings are stored

All settings are stored on this device. Nothing is synced to a cloud account.

| What | Saved across restarts | Where |
| --- | --- | --- |
| Appearance, steering speed, letter prediction, dwell activation, dwell time, edge target size, pointer dot | Yes | `settings.json` in the app's user data folder |
| Gemini on or off, phrase model, Jev tone suggestions on or off | Yes | `settings.json` in the app's user data folder |
| Input source, camera choice, eye tracker calibration, head pointer sensitivity | Yes | The app's local browser storage |
| Head pointer centering | No. You center once per session. | Not saved |
| Voice, speaking speed, playback volume, delivery tone, microphone | Yes | `voice-settings.json` in the app's user data folder |
| Correction memory switches and saved corrections | Yes | `memory.sqlite` in the app's user data folder |
| **Use saved facts in suggestions**, saved facts, and saved sentences | Yes | `preferences.sqlite` in the app's user data folder |
| Saved phrases | Yes | `phrase-cache.json` in the app's user data folder |
| Session conversation | No. It is kept only for the current session. | Memory only |

Provider credentials are not settings. They come from a `.env` file or the environment that launches SpeakEasy, and you restart the app after changing them. See [Cloud features](../../getting-started/cloud-features/).

If SpeakEasy cannot read or write its settings file, a message appears at the top of the window, such as "Settings could not be saved. Check storage access before closing SpeakEasy." Your change still applies for the current session. If voice settings cannot be saved, the Voice tab says they will reset after restart.

For what each provider receives and how to delete stored data, see [Your data](../../privacy/data/).
