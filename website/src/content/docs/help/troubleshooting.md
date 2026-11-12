---
title: Troubleshooting
description: Fixes for camera permission, calibration drift, double selections with an eye tracker, missing suggestions, missing speech, and transcription.
sidebar:
  order: 1
---

## The camera does not start

The General settings show a camera status under **Input** when you choose a webcam input.

- **macOS.** Open **System Settings → Privacy & Security → Camera** and allow SpeakEasy. If you run from source, allow the terminal or editor that launched `npm run dev`, because macOS asks on its behalf. Restart SpeakEasy afterwards. The message "Camera is not sending frames" usually means this permission is missing.
- **Windows.** Open **Settings → Privacy & security → Camera** and make sure camera access and access for desktop apps are on.
- **Linux.** SpeakEasy has no Linux-specific permission prompt. Check that the camera works in another app and is not already in use.

If you have more than one camera, choose the right one under **Camera** in **Menu → Settings → General**. If the status says "No face detected", sit facing the camera in good light.

## Steering drifts or misses targets

- **Webcam gaze.** Choose **Recalibrate eye tracker** in **Menu → Settings → General**. Sit the way you will use the app before you start. Recalibrate whenever you move your chair, screen, or camera.
- **Head pointer.** Choose **Center head pointer** again, or adjust **Head pointer sensitivity**.
- **Accidental selections.** Increase **Dwell time**, or lower **Steering speed**.

If writing pauses with "Eye tracking lost", SpeakEasy could not see your face. Your message is kept. Look at the crosshair or select **Start writing** to continue.

## A control is selected twice with an eye tracker

Your tracker's dwell or click emulation and SpeakEasy's **Dwell activation** are both selecting the same control. Use only one of them. Either set **Dwell activation** to **Off** in **Menu → Settings → General** and keep the tracker's click emulation, or turn off the tracker's click emulation and keep SpeakEasy's dwell on. See [Input setup](../../getting-started/input-setup/#dedicated-eye-trackers).

## No phrase suggestions appear

Check **Menu → Settings → Gemini**:

- "Set OPENROUTER_TOKEN in the app .env and restart to connect Gemini." means the OpenRouter key is missing. Add it and restart.
- "Configure MOSS_PROJECT_ID and MOSS_PROJECT_TOKEN in the app .env and restart" means the Moss credentials are missing. Suggestions need them as well.
- If the button reads **Enable Gemini**, Gemini is off. Select it.

In the phrase area, "Memory context unavailable. Check Moss credentials and connection" points to Moss credentials or the network. Choose **Retry**. Your message is not affected, and exact spelling still works.

Packaged builds do not read `.env`. Set the variables in the launching process's environment. See [Cloud features](../../getting-started/cloud-features/).

## Speak is unavailable

If **Speak** shows "Voice is unavailable. Set up Cartesia in Settings → Voice.", `CARTESIA_API_KEY` is not set. Add it and restart.

- "Could not load Cartesia voices. Check the API key and network." means the key was rejected or there is no connection.
- "Angle-bracket control markup is not supported." means your message contains `<` or `>`, which Cartesia treats as control tags. Remove them; SpeakEasy will not change your text for you.
- Speech supports up to 2,000 characters per message.
- Check **Playback volume** in **Menu → Settings → Voice**.

## Transcription does not work

The microphone status beside your message reads **Listening** when transcription is running.

- **Microphone unavailable** with "Microphone permission needed" means access was denied. On macOS, open **System Settings → Privacy & Security → Microphone**, allow SpeakEasy (or the terminal that launched it), and restart.
- "Set CARTESIA_API_KEY in .env and restart" means the key is missing.
- Choose the right **Microphone** in **Menu → Settings → Voice**. The live transcript there helps you check it.
- **Mic paused during speech** is expected. Listening resumes shortly after playback ends, and speech that overlaps playback is not captured.

Transcription does not separate speakers. All transcribed speech is treated as your conversation partners.

## Still stuck

Open an [issue on GitHub](https://github.com/Luke-Pitstick/SpeakEasy/issues). Leave out keys and personal conversations.
