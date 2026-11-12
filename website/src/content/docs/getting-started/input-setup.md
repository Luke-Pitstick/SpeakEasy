---
title: Input setup
description: Set up a mouse, webcam gaze, head pointer, or dedicated eye tracker, and tune dwell activation.
sidebar:
  order: 3
---

SpeakEasy can be steered with a mouse, with webcam gaze, or with a head pointer. Dedicated eye trackers work through Mouse mode when the tracker moves the desktop pointer. Choose the input in **Menu → Settings → General** under **Input**.

While you set up, you can use a mouse or keyboard to change settings. Changing a setting pauses writing; select **Start writing** when you are ready.

## Mouse or trackpad

Set **Input** to **Mouse**. This is the default. Steer in Dasher by moving the pointer, and select buttons by clicking or, with **Dwell activation** on, by resting the pointer on them.

## Webcam gaze

Webcam gaze uses a built-in or external webcam to estimate where you are looking. Camera frames are processed on your device and are not sent anywhere. Webcam gaze has been exercised with real calibration data, but its accuracy depends on your camera, lighting, and seating position.

1. Open **Menu → Settings → General** and set **Input** to **Eye tracker (webcam)**.
2. Allow camera access when your operating system asks. If you have more than one camera, choose one under **Camera**. If no face is found, the settings show a camera preview and the message "No face detected"; sit facing the camera.
3. Select **Calibrate eye tracker** and follow the prompts. Sit the way you normally will, look at each dot until it moves on, and move your head when the prompts ask you to. Press Esc to cancel. Until you calibrate, the mouse keeps working.
4. When the status reads "Eye tracker calibrated and driving the pointer.", close the menu and select **Start writing**.

Calibration is saved and used next time. If steering becomes inaccurate after you change position, choose **Recalibrate eye tracker**. **Pointer dot** shows or hides the dot that marks your estimated gaze.

## Head pointer

The head pointer moves the pointer with your head instead of your eyes. Point with your nose.

1. Set **Input** to **Head pointer (webcam)** and allow camera access.
2. Select **Center head pointer**, point your nose at the dot, and hold still.
3. Adjust **Head pointer sensitivity** if the pointer moves too far or not far enough.

Center again if the pointer drifts.

## When the webcam loses you

With either webcam input, if SpeakEasy stops detecting your face, it cancels any pending selection and pauses writing. Your message is kept. To continue, look at the crosshair in the middle of Dasher or select **Start writing**.

## Dedicated eye trackers

SpeakEasy does not connect to eye tracker hardware directly. A dedicated tracker can work if its own software moves the regular desktop pointer continuously as you look around. Model-specific compatibility is unverified: no tracker model has been tested and recorded for this project yet.

1. Install the tracker's driver and software, and calibrate it for the display that shows SpeakEasy.
2. In the tracker's software, turn on continuous gaze-to-pointer movement. Check that moving your eyes moves the desktop pointer smoothly. A tracker that only provides raw gaze data, or only moves the pointer when it clicks, will not work this way.
3. In **Menu → Settings → General**, leave **Input** set to **Mouse**.
4. Use one dwell system at a time. Either turn on SpeakEasy's **Dwell activation** and turn off the tracker's own dwell-click or click emulation, or the other way round. If both are on, one look can select a control twice.
5. Try dwelling on the **Menu** bar before you steer in Dasher.
6. Check what happens when the tracker loses your eyes. In Mouse mode SpeakEasy only sees pointer movement, so pausing on tracking loss depends on what the tracker software does with the pointer.

If you try a tracker, please share the results, including setups that work. Use the [tracker compatibility report template](https://github.com/Luke-Pitstick/SpeakEasy/blob/main/.github/ISSUE_TEMPLATE/tracker-compatibility.md) and [open an issue](https://github.com/Luke-Pitstick/SpeakEasy/issues/new/choose). Use sample phrases rather than personal messages in screenshots.

## Dwell activation

Dwell lets you select a button by holding the pointer on it, with any input. These settings are in **Menu → Settings → General**:

| Setting              | Options                                   | What it does                                                                                         |
| -------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Dwell activation** | **On** (look to select), **Off** (click to select) | On by default. Rest on a button to select it; move off to cancel. Each visit selects a button at most once. |
| **Dwell time**       | 700 ms, 1 second, 1.5 seconds             | How long you hold before a selection. 1 second by default. Increase it if you select things by accident. |
| **Steering speed**   | **Slowest** to **Fastest**                | How fast Dasher zooms for a given pointer offset. **Standard** by default.                          |
| **Edge target size** | 48 px, 64 px, 88 px                       | The height of the **Show phrases** and **Menu** bars at the top and bottom edges.                   |

For every option on this tab, see [General settings](../../settings/general/).
