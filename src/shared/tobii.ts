// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

/**
 * Tobii eye trackers (4C, 5) reach SpeakEasy through Talon, which has its own macOS driver: a
 * Talon user script (`scripts/talon/speakeasy_gaze.py`) sends each gaze frame as a small JSON
 * datagram to this loopback UDP port. See `docs/tobii-talon.md`.
 */
export const TOBII_PORT = 47821

/** Datagrams larger than this are not gaze packets. */
const MAX_PACKET_BYTES = 256
/** Screen coordinates beyond this are not real display positions. */
const MAX_COORDINATE = 100_000

/**
 * One gaze frame. `x`/`y` are global screen coordinates in points (macOS points, which match
 * Electron's DIP and the renderer's `window.screenX` space). An invalid frame means the tracker
 * reported no gaze (blink, looking away, eyes not found).
 */
export type TobiiSample = { valid: true; x: number; y: number } | { valid: false }

export interface TobiiStatus {
  /** Why the listener could not start (e.g. the port is taken), or null when listening. */
  error: string | null
}

export interface TobiiApi {
  /** Starts listening for gaze from Talon. Resolves once listening, or with the error. */
  start: () => Promise<TobiiStatus>
  stop: () => void
  onSample: (listener: (sample: TobiiSample) => void) => () => void
}

/** Validates one datagram from the Talon script; anything malformed is dropped. */
export function parseTobiiPacket(data: string): TobiiSample | null {
  if (data.length > MAX_PACKET_BYTES) return null
  let packet: unknown
  try {
    packet = JSON.parse(data)
  } catch {
    return null
  }
  if (typeof packet !== 'object' || packet === null) return null
  const { v, valid, x, y } = packet as Record<string, unknown>
  if (v !== 1) return null
  if (valid === false) return { valid: false }
  if (valid !== true) return null
  const coordinate = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= MAX_COORDINATE
  return coordinate(x) && coordinate(y) ? { valid: true, x, y } : null
}
