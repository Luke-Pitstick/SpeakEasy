// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { GazePointerBridge } from '../src/renderer/src/eyetracking/gazePointerBridge'
import type { GazeTracker, TrackerState } from '../src/renderer/src/eyetracking/GazeTracker'
import type { GazePoint } from '../src/renderer/src/eyetracking/types'
import { ActionButton, InteractionProvider } from '../src/renderer/src/interaction/controls'

// A tracker stand-in exposing only what the bridge uses: gaze samples and face/tracking state.
function fakeTracker(): {
  tracker: GazeTracker
  look: (x: number, y: number) => void
  loseFace: () => void
} {
  const gazeListeners = new Set<(g: GazePoint) => void>()
  const stateListeners = new Set<() => void>()
  let state = { faceDetected: true } as TrackerState
  const tracker = {
    onGaze: (l: (g: GazePoint) => void) => {
      gazeListeners.add(l)
      return () => gazeListeners.delete(l)
    },
    subscribe: (l: () => void) => {
      stateListeners.add(l)
      return () => stateListeners.delete(l)
    },
    getState: () => state
  } as unknown as GazeTracker
  return {
    tracker,
    look: (x, y) => {
      const g = {
        x,
        y,
        rawX: x,
        rawY: y,
        screenX: x,
        screenY: y,
        target: null,
        timestamp: 0,
        blinking: false
      }
      gazeListeners.forEach((l) => l(g))
    },
    loseFace: () => {
      state = { ...state, faceDetected: false }
      stateListeners.forEach((l) => l())
    }
  }
}

let bridge: GazePointerBridge | null = null
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  bridge?.stop()
  bridge = null
  cleanup()
  vi.useRealTimers()
})

/** One dwell button covering x < 100; anything else is outside it. */
function setup(onAction: () => void): ReturnType<typeof fakeTracker> {
  render(
    <InteractionProvider>
      <ActionButton identity="speak" onAction={onAction}>
        Speak
      </ActionButton>
    </InteractionProvider>
  )
  const button = screen.getByRole('button', { name: 'Speak' })
  document.elementFromPoint = (x: number) => (x < 100 ? button : document.body)
  const fake = fakeTracker()
  bridge = new GazePointerBridge(fake.tracker)
  bridge.start()
  return fake
}

it('dwelling with the eyes on a button activates it through its own pointer dwell', () => {
  const onAction = vi.fn()
  const { look } = setup(onAction)
  look(50, 10)
  vi.advanceTimersByTime(500)
  look(52, 11)
  vi.advanceTimersByTime(600)
  expect(onAction).toHaveBeenCalledTimes(1)
})

it('tracking loss cancels a pending dwell', () => {
  const onAction = vi.fn()
  const { look, loseFace } = setup(onAction)
  look(50, 10)
  vi.advanceTimersByTime(500)
  loseFace()
  vi.advanceTimersByTime(1500)
  expect(onAction).not.toHaveBeenCalled()
})

it('looking away before the dwell completes cancels it', () => {
  const onAction = vi.fn()
  const { look } = setup(onAction)
  look(50, 10)
  vi.advanceTimersByTime(500)
  look(500, 10)
  vi.advanceTimersByTime(1500)
  expect(onAction).not.toHaveBeenCalled()
})
