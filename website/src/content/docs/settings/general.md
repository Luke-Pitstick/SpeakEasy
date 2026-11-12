---
title: General settings
description: Input source, camera, calibration, centering, dwell, steering speed, and display settings on the General tab.
sidebar:
  order: 2
---

The **General** tab in **Menu → Settings → General** controls how you point and select, how fast Dasher moves, and how the app looks. Some controls only appear for a webcam input. Changing most of these settings pauses writing; choose **Start writing** when you are ready to continue.

For a first-time walkthrough, see [Input setup](../../getting-started/input-setup/).

## Input and camera

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Input** | Chooses what moves the pointer. | **Mouse** | **Mouse**, **Eye tracker (webcam)**, **Head pointer (webcam)** |
| **Camera** | Chooses which webcam the eye tracker or head pointer uses. Only appears when **Input** is a webcam option and more than one camera is available. | The system's default camera | The cameras your computer reports |
| **Pointer dot** | Shows or hides the dot that marks where SpeakEasy thinks you are pointing. Only appears when **Input** is a webcam option. | **Shown** | **Shown**, **Hidden** |

Choose **Mouse** if you use a dedicated eye tracker that moves the regular desktop pointer. SpeakEasy then follows the pointer like a mouse, and you turn on **Dwell activation** below.

**Input** and **Camera** are remembered across restarts. If a remembered camera is no longer connected, SpeakEasy forgets it and uses the default camera.

When a webcam input is selected, a status line under these controls tells you what the tracker is doing, for example "Starting camera…" or "No face detected. Sit facing the camera, or choose another camera." If the camera is running but cannot see your face, a camera preview appears so you can adjust your position.

## Eye tracker calibration

This control only appears when **Input** is **Eye tracker (webcam)**.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Calibrate eye tracker** | Starts calibration. You look at a series of dots, some while turning or tilting your head as shown on screen. Press **Esc** to cancel. After the first calibration the button reads **Recalibrate eye tracker**. Available once the camera is running. | Not calibrated | Action |

Until you calibrate, the mouse keeps working and the eye tracker does not move the pointer. Calibration is saved and reused after a restart. Recalibrate if you move your seat, screen, or camera, or if the pointer consistently lands away from where you look.

## Head pointer

These controls only appear when **Input** is **Head pointer (webcam)**.

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Center head pointer** | Sets the head position that counts as pointing at the middle of the screen. Point your nose at the dot and hold still for about two seconds. Press **Esc** to cancel. Available once the camera can see your face. | Not centered | Action |
| **Head pointer sensitivity** | How far the pointer moves for a given head turn or tilt. Higher values need smaller head movements. | **Standard** | **Lowest**, **Lower**, **Low**, **Standard**, **High**, **Higher**, **Very high**, **Highest** |

Centering is needed once per session. SpeakEasy opens the centering screen on its own the first time it sees your face; if you cancel it, use **Center head pointer** when you are ready. Center again whenever the pointer drifts from where you are pointing. **Head pointer sensitivity** is remembered across restarts.

Raise sensitivity if reaching the screen edges strains your neck. Lower it if the pointer jumps past targets.

## Appearance and steering

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Appearance** | Chooses the color theme. **System** follows your computer's light or dark mode. | **System** | **System**, **Light**, **Dark** |
| **Steering speed** | How fast Dasher zooms and pans for a given pointer offset from the center. | **Standard** | **Slowest**, **Slower**, **Slow**, **Standard**, **Quick**, **Fast**, **Faster**, **Fastest** |
| **Letter prediction** | Chooses how Dasher sizes the letter boxes. **PPM (trained initials)** makes likely next letters larger. **Uniform** gives every letter the same size. A status line underneath shows which model is in use. | **PPM (trained initials)** | **PPM (trained initials)**, **Uniform** |

Start with a slower **Steering speed** while you learn to steer, especially with webcam input, and speed up as you get comfortable. If you overshoot letters or find yourself reversing often, slow down.

## Dwell and edge targets

| Setting | What it does | Default | Options or range |
| --- | --- | --- | --- |
| **Dwell activation** | When on, you select a button by looking at it and holding. When off, you click to select. | **On - look to select** | **Off - click to select**, **On - look to select** |
| **Dwell time** | How long you must hold on a button before it activates. | **1 second** | **700 ms**, **1 second**, **1.5 seconds** |
| **Edge target size** | Height of the **Show phrases** bar at the top edge and the **Menu** bar at the bottom edge. | **Compact - 48 px** | **Compact - 48 px**, **Large - 64 px**, **Extra large - 88 px** |

Lengthen **Dwell time** if you select things by accident. Shorten it once your pointing is steady and you want to move faster. Choose a larger **Edge target size** if you find it hard to land on the top or bottom bars, or if you trigger them by accident while steering near the edge.

If you use a dedicated eye tracker with its own click or dwell feature, use only one dwell system at a time so a single look does not activate a control twice.

All settings in this section are remembered across restarts.
