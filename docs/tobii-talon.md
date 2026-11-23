# Tobii input through Talon

Status: implemented. Live gaze checked on 2026-11-22 with a Tobii 4C (firmware 10007), Talon
0.4.0 and macOS 14.4 on a MacBook Pro (1728 × 1117 pt main display). After Talon calibration,
about 90 valid packets per second reached SpeakEasy and drove its pointer (271 bridged pointer
moves in 3 s). Synthetic tests cover packet validation, tracking loss and source switching
(`tests/tobii-input.test.ts`). Gaze usability (dwell, Dasher, edge cues) is not yet evaluated.

## Decision

Tobii doesn't support its consumer trackers (4C, Eye Tracker 5) on macOS. Stream Engine is
Windows/Linux only. The Tobii Pro SDK runs on macOS but targets Pro hardware. Talon ships its own
macOS driver for these trackers, so SpeakEasy reads gaze from Talon rather than from the USB device.
Talon is closed-source third-party software the user installs; SpeakEasy bundles none of it.

## Setup

1. Install [Talon](https://talonvoice.com) and connect the tracker. Talon has no window or Dock
   icon, only an icon at the right of the top menu bar (on notched MacBooks it can be hidden when
   the menu bar is full). `~/.talon/talon.log` should show `USB: Tobii 4C v2 attached`.
2. Calibrate: Talon menu → **Eye Tracking** → Calibrate, or without the menu run
   `echo 'actions.tracking.calibrate()' | ~/.talon/bin/repl`. Talon saves it in
   `~/.talon/calib.bin`. Leave Talon's own mouse control off, so it doesn't move the system
   pointer at the same time.
3. Copy [`scripts/talon/speakeasy_gaze.py`](../scripts/talon/speakeasy_gaze.py) into
   `~/.talon/user/`. Talon loads it automatically; the log shows
   `SpeakEasy gaze bridge: streaming from tracker`.
4. In SpeakEasy, open **Menu → Settings → General** and set **Input** to
   **Tobii eye tracker (via Talon)**. The status line reads "driving the pointer" once gaze arrives.
5. Turn on **Dwell activation**. Calibration happens in Talon; SpeakEasy's webcam calibration
   and selection learning don't apply to this input.

## How it works

- `scripts/talon/speakeasy_gaze.py` sends one UDP datagram per gaze frame to `127.0.0.1:47821`:
  `{"v":1,"valid":true,"x":…,"y":…}` in global macOS screen points, or `{"v":1,"valid":false}`
  when the tracker sees no eyes. The script follows the tracker API in Talon 0.4's bundled
  `talon_plugins/eye_mouse.py` (`tobii.TobiiEC` USB devices, `register('gaze', …)`,
  `frame.gaze` normalised to the main screen) and maps gaze onto the main display.
- `src/main/tobiiIpc.ts` binds that port on loopback only, and only while the Tobii input is
  selected. It drops non-loopback senders and validates every packet
  (`parseTobiiPacket` in `src/shared/tobii.ts`) before forwarding it over the preload `tobii` API.
- `GazeTracker` (`pointerMode: 'tobii'`) skips the camera entirely and feeds samples through the
  same smoothing, aim assist, dwell, and pointer bridge as webcam gaze.
- **Stale-sample policy:** invalid frames are ignored. Tracking counts as lost after 500 ms with no
  valid sample, which is longer than a blink. Tracking loss cancels pending dwell and pauses
  writing, as with the webcam.
- **Coordinates:** points match Electron DIP and the renderer's `window.screenX` space, so no
  further transform is applied. Only the main display is supported, since that's where Talon's
  gaze is mapped.

## Not yet verified

- Gaze usability with Dasher and the edge cues, and the same-tracker baseline comparison.
