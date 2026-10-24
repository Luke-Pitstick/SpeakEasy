// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { WebcamFaceSource } from '../src/renderer/src/eyetracking/WebcamFaceSource'

it('keeps processing frames after a frame throws', () => {
  const onFeatures = vi.fn()
  const source = new WebcamFaceSource(onFeatures)
  const internals = source as unknown as {
    running: boolean
    landmarker: { detectForVideo: () => unknown }
    video: HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }
    processFrame: () => void
  }
  const scheduled = vi.fn(() => 1)
  internals.video.requestVideoFrameCallback = scheduled
  internals.running = true
  let calls = 0
  internals.landmarker = {
    detectForVideo: () => {
      calls++
      if (calls === 1) throw new Error('bad frame')
      return { faceLandmarks: [], facialTransformationMatrixes: [] }
    }
  }
  vi.spyOn(console, 'error').mockImplementation(() => {})

  expect(() => internals.processFrame()).not.toThrow()
  expect(scheduled).toHaveBeenCalledTimes(1)
  internals.processFrame()
  expect(scheduled).toHaveBeenCalledTimes(2)
  // The second frame (no face) is still reported.
  expect(onFeatures).toHaveBeenCalledWith(null)
})
