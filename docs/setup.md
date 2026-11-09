# Set up SpeakEasy

Follow the [source install instructions](../README.md#install-speakeasy) to open the app. Try it with
a mouse first. Select **Menu → Exact spelling**, start writing, and steer right toward the letters
you want. Move left to reverse. Exact spelling works without provider credentials.

## Input setup

### Webcam gaze or head pointing

1. Open **Menu → Settings → General**. Set **Input** to **Eye tracker (webcam)** or **Head pointer (webcam)**.
2. Allow camera access when prompted. On macOS, check **System Settings → Privacy & Security → Camera**
   for the app or terminal that launched Electron. If multiple cameras are available, use **Camera**
   in SpeakEasy to select one.
3. For gaze, choose **Calibrate eye tracker** and follow the on-screen prompts. For head pointing,
   choose **Center head pointer** and point your nose at the center dot. Repeat calibration or
   centering if your position changes enough to make steering difficult.
4. Turn on **Dwell activation** and adjust **Dwell time** and **Steering speed** to suit your input.
   You can use a mouse or keyboard to change settings during setup.

Webcam frames are processed on-device. If the webcam loses your face, the built-in tracking path
cancels the pending selection and pauses writing.

### Dedicated eye trackers

1. Install the tracker’s driver and accessibility software, then calibrate it for the display
   running SpeakEasy.
2. Enable continuous gaze-to-pointer movement in the tracker’s software. Confirm that moving your
   gaze moves the regular desktop pointer continuously. A tracker that only exposes raw gaze data
   or moves the pointer on click needs a separate pointer integration.
3. In **Menu → Settings → General**, leave **Input** set to **Mouse** and turn on **Dwell activation**.
   Try dwell on the Menu button before steering in Dasher. Start with one dwell system so the
   tracker’s click emulation and SpeakEasy’s dwell don’t both activate the same control.
4. Check what the pointer does when the tracker loses your eyes. SpeakEasy sees pointer events in
   Mouse mode, so loss and recovery depend on what the tracker software does with the pointer.

The repository has no verified model-specific results yet. If you test a tracker, use the
[compatibility report template](../.github/ISSUE_TEMPLATE/tracker-compatibility.md) to collect your
results, then [open an issue](https://github.com/Luke-Pitstick/SpeakEasy/issues/new).

## Cloud features

For a source checkout, add the credentials you need to a private `.env` at the repository root
before starting the app. For a packaged build, set them in the environment of the process that
launches SpeakEasy. Restart after changing credentials. Keep keys out of commits, screenshots,
and issue reports.

| Feature                                 | Setup                                                                                                                          | Data sent                                                                                                                                                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phrase generation and cloud refinements | Set `OPENROUTER_TOKEN`, `MOSS_PROJECT_ID`, and `MOSS_PROJECT_TOKEN`, then choose **Menu → Settings → Gemini → Enable Gemini**. | OpenRouter receives initials or other message constraints and relevant conversation or permitted memory context. Moss searches locally and contacts its service for authentication, model setup, and usage telemetry.                                                          |
| Speech and conversation transcription   | Set `CARTESIA_API_KEY`. Open **Menu → Settings → Voice** to pick and preview an available voice.                               | **Speak** and **Preview voice** send text and voice settings to Cartesia. With a key configured and microphone permission granted, SpeakEasy also starts streaming mic audio to Cartesia for transcription. Deny microphone access if you want playback without transcription. |
| Optional tone suggestions               | Set `TYPESAFE_AI_API_TOKEN` and choose **Suggest tone with Jev** in Voice settings.                                            | Jev receives the ready-to-speak message and up to eight recent conversation turns. The suggestion is editable before speech.                                                                                                                                                   |

For details on local storage and provider requests, see the [technical overview](technical-overview.md)
and [voice integration notes](voice-integration.md).
