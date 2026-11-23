# SPDX-FileCopyrightText: 2026 SpeakEasy contributors
# SPDX-License-Identifier: GPL-3.0-only
# See LICENSE for the full terms, including the warranty disclaimer.
"""Streams Tobii gaze from Talon to SpeakEasy.

Copy this file into your Talon user folder (~/.talon/user/). Talon reads the Tobii tracker with
its own driver (and applies its own calibration); this script forwards each gaze frame as a
small JSON datagram to SpeakEasy on 127.0.0.1. Nothing leaves this computer. SpeakEasy listens
only while its Input setting is "Tobii eye tracker (via Talon)"; at other times the datagrams
are simply dropped.

Packet: {"v": 1, "valid": true, "x": <screen x>, "y": <screen y>} in macOS points (global
screen coordinates), or {"v": 1, "valid": false} when the tracker sees no eyes.

Follows the tracker API used by Talon 0.4's bundled talon_plugins/eye_mouse.py: trackers arrive
as `tobii.TobiiEC` USB devices, and `frame.gaze` is normalised to the main screen.
"""

import json
import socket

from talon import ui, usb
from talon.track import tobii

SPEAKEASY_PORT = 47821  # Must match TOBII_PORT in src/shared/tobii.ts.

_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
_sock.setblocking(False)
_INVALID = json.dumps({"v": 1, "valid": False}).encode()
_tracker = None
_rect = ui.main_screen().rect


def _send(packet: bytes) -> None:
    try:
        _sock.sendto(packet, ("127.0.0.1", SPEAKEASY_PORT))
    except OSError:
        pass  # SpeakEasy isn't listening; drop the frame.


def _on_gaze(frame) -> None:
    pos = frame.gaze
    if pos is None or not (frame.left or frame.right):
        _send(_INVALID)
        return
    x = _rect.x + pos.x * _rect.width
    y = _rect.y + pos.y * _rect.height
    _send(json.dumps({"v": 1, "valid": True, "x": round(x, 1), "y": round(y, 1)}).encode())


def _on_attach(dev) -> None:
    global _tracker
    if isinstance(dev, tobii.TobiiEC) and _tracker is None:
        _tracker = dev
        _tracker.register("gaze", _on_gaze)
        print("SpeakEasy gaze bridge: streaming from tracker")


def _on_detach(dev) -> None:
    global _tracker
    if dev == _tracker:
        try:
            _tracker.unregister("gaze", _on_gaze)
        except Exception:
            pass
        _tracker = None
        print("SpeakEasy gaze bridge: tracker detached")


def _on_screen_change(_screens) -> None:
    global _rect
    _rect = ui.main_screen().rect


usb.register("attach", _on_attach)
usb.register("detach", _on_detach)
ui.register("screen_change", _on_screen_change)
for _dev in usb.devices():
    _on_attach(_dev)
