// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

/**
 * What drives the pointer: the mouse, the webcam eye tracker, (opt-in) head pointing, or a Tobii
 * eye tracker through Talon.
 */
export type InputSource = 'mouse' | 'eyes' | 'head' | 'tobii'

const INPUT_KEY = 'speakeasy.input'

export function loadInputSource(): InputSource {
  try {
    const value = localStorage.getItem(INPUT_KEY)
    return value === 'eyes' || value === 'head' || value === 'tobii' ? value : 'mouse'
  } catch {
    return 'mouse'
  }
}

export function saveInputSource(input: InputSource): void {
  try {
    localStorage.setItem(INPUT_KEY, input)
  } catch {
    // Remembering the choice is a convenience; the selection still applies this session.
  }
}
