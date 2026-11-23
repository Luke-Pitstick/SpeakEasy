// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GazeTracker } from '../src/renderer/src/eyetracking/GazeTracker'
import { parseTobiiPacket, type TobiiSample } from '../src/shared/tobii'

let send: ((sample: TobiiSample) => void) | null = null
const api = {
  start: vi.fn(async () => ({ error: null as string | null })),
  stop: vi.fn(),
  onSample: vi.fn((listener: (sample: TobiiSample) => void) => {
    send = listener
    return () => {
      send = null
    }
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom lacks these browser APIs.
  document.elementFromPoint = () => null
  HTMLVideoElement.prototype.cancelVideoFrameCallback = () => {}
  window.tobii = api
  api.start.mockClear()
  api.stop.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
  delete window.tobii
  localStorage.clear()
})

async function runningTracker(): Promise<GazeTracker> {
  const tracker = new GazeTracker()
  tracker.setPointerMode('tobii')
  await tracker.start()
  return tracker
}

it('accepts only well-formed gaze packets', () => {
  expect(parseTobiiPacket('{"v":1,"valid":true,"x":100.5,"y":-20}')).toEqual({
    valid: true,
    x: 100.5,
    y: -20
  })
  expect(parseTobiiPacket('{"v":1,"valid":false}')).toEqual({ valid: false })
  expect(parseTobiiPacket('{"v":1,"valid":true,"x":"1","y":2}')).toBeNull()
  expect(parseTobiiPacket('{"v":1,"valid":true,"x":1e9,"y":2}')).toBeNull()
  expect(parseTobiiPacket('{"v":2,"valid":true,"x":1,"y":2}')).toBeNull()
  expect(parseTobiiPacket('not json')).toBeNull()
  expect(parseTobiiPacket(`{"v":1,"valid":false,"pad":"${'x'.repeat(300)}"}`)).toBeNull()
})

it('drives gaze from Tobii samples without opening the camera', async () => {
  const getUserMedia = vi.fn()
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } })
  const tracker = await runningTracker()
  expect(tracker.getState().status).toBe('running')
  expect(getUserMedia).not.toHaveBeenCalled()

  const gazes: { screenX: number; screenY: number }[] = []
  tracker.onGaze((gaze) => gazes.push(gaze))
  send?.({ valid: true, x: 400, y: 300 })
  expect(tracker.getState().faceDetected).toBe(true)
  expect(gazes).toHaveLength(1)
  expect(gazes[0].screenX).toBeCloseTo(400)
  expect(gazes[0].screenY).toBeCloseTo(300)
  vi.unstubAllGlobals()
})

it('reports tracking loss once gaze stops, but not during a blink', async () => {
  const tracker = await runningTracker()
  send?.({ valid: true, x: 400, y: 300 })
  send?.({ valid: false })
  vi.advanceTimersByTime(300)
  expect(tracker.getState().faceDetected).toBe(true)
  vi.advanceTimersByTime(400)
  expect(tracker.getState().faceDetected).toBe(false)
})

it('stops listening when stopped or switched to another input', async () => {
  const tracker = await runningTracker()
  tracker.setPointerMode('head')
  expect(api.stop).toHaveBeenCalledTimes(1)
  expect(send).toBeNull()
  tracker.stop()
})

it('shows the listener error instead of running', async () => {
  api.start.mockResolvedValueOnce({ error: 'Port 47821 is already in use.' })
  const tracker = await runningTracker()
  expect(tracker.getState()).toMatchObject({
    status: 'error',
    error: 'Port 47821 is already in use.'
  })
  expect(send).toBeNull()
})
