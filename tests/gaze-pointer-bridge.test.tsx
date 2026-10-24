// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
        blinking: false,
        offscreen: x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight
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

it('looking off a side or bottom edge leaves without entering anything, like a mouse leaving the window', () => {
  const { look } = setup(vi.fn())
  const button = screen.getByRole('button', { name: 'Speak' })
  const leaves: (EventTarget | null)[] = []
  button.addEventListener('pointerleave', (e) => leaves.push((e as PointerEvent).relatedTarget))
  look(50, 10)
  look(-40, 10)
  expect(leaves).toEqual([null])
  look(50, 10)
  look(50, window.innerHeight + 40)
  expect(leaves).toEqual([null, null])
})

it('looking or pointing past the top edge keeps pressing the top-row button', () => {
  const onAction = vi.fn()
  const { look } = setup(onAction)
  // The button spans x < 100 of the top row; looking far above it still dwells on it.
  look(50, -200)
  vi.advanceTimersByTime(600)
  look(60, -350)
  vi.advanceTimersByTime(500)
  expect(onAction).toHaveBeenCalledTimes(1)
})

describe('top cue', () => {
  /** The top cue region (48 px tall) with its button, and a header button right below it. */
  function setupCue(onCue: () => void, onHeader: () => void): ReturnType<typeof fakeTracker> {
    render(
      <InteractionProvider>
        <div data-gaze-top-cue>
          <ActionButton identity="cue" onAction={onCue}>
            Show phrases
          </ActionButton>
        </div>
        <ActionButton identity="menu" onAction={onHeader}>
          Menu
        </ActionButton>
      </InteractionProvider>
    )
    const region = document.querySelector('[data-gaze-top-cue]') as HTMLElement
    region.getBoundingClientRect = () => ({ top: 0, bottom: 48 }) as DOMRect
    const cue = screen.getByRole('button', { name: 'Show phrases' })
    const menu = screen.getByRole('button', { name: 'Menu' })
    document.elementFromPoint = (_x: number, y: number) => (y < 48 ? cue : menu)
    const fake = fakeTracker()
    bridge = new GazePointerBridge(fake.tracker)
    bridge.start()
    return fake
  }

  it('is pressed at and above the upper limit of the page', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    look(400, 0)
    vi.advanceTimersByTime(500)
    look(400, -300)
    vi.advanceTimersByTime(600)
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('counts a pointer just below the cue as on it', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    look(400, 48 + 20)
    vi.advanceTimersByTime(1100)
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('keeps the dwell going through jitter near its edge', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    for (let i = 0; i < 10; i++) {
      look(400, i % 2 ? 48 + 55 : 30)
      vi.advanceTimersByTime(110)
    }
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('lets go once the pointer moves clearly away, leaving the header button reachable', () => {
    const onCue = vi.fn()
    const onHeader = vi.fn()
    const { look } = setupCue(onCue, onHeader)
    look(400, 20)
    vi.advanceTimersByTime(500)
    look(400, 48 + 80)
    vi.advanceTimersByTime(1100)
    expect(onCue).not.toHaveBeenCalled()
    expect(onHeader).toHaveBeenCalledTimes(1)
  })
})

describe('bottom cue', () => {
  /** The bottom cue region (the last 48 px) with its button, and a footer button right above it. */
  function setupCue(onCue: () => void, onFooter: () => void): ReturnType<typeof fakeTracker> {
    render(
      <InteractionProvider>
        <ActionButton identity="footer" onAction={onFooter}>
          None of these
        </ActionButton>
        <div data-gaze-bottom-cue>
          <ActionButton identity="cue" onAction={onCue}>
            Menu
          </ActionButton>
        </div>
      </InteractionProvider>
    )
    const top = window.innerHeight - 48
    const region = document.querySelector('[data-gaze-bottom-cue]') as HTMLElement
    region.getBoundingClientRect = () => ({ top, bottom: window.innerHeight }) as DOMRect
    const cue = screen.getByRole('button', { name: 'Menu' })
    const footer = screen.getByRole('button', { name: 'None of these' })
    document.elementFromPoint = (_x: number, y: number) => (y >= top ? cue : footer)
    const fake = fakeTracker()
    bridge = new GazePointerBridge(fake.tracker)
    bridge.start()
    return fake
  }

  it('is pressed at and below the lower limit of the page', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    look(400, window.innerHeight - 1)
    vi.advanceTimersByTime(500)
    look(400, window.innerHeight + 300)
    vi.advanceTimersByTime(600)
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('counts a pointer just above the cue as on it', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    look(400, window.innerHeight - 48 - 20)
    vi.advanceTimersByTime(1100)
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('keeps the dwell going through jitter near its edge', () => {
    const onCue = vi.fn()
    const { look } = setupCue(onCue, vi.fn())
    for (let i = 0; i < 10; i++) {
      look(400, i % 2 ? window.innerHeight - 48 - 55 : window.innerHeight - 30)
      vi.advanceTimersByTime(110)
    }
    expect(onCue).toHaveBeenCalledTimes(1)
  })

  it('lets go once the pointer moves clearly away, leaving the footer button reachable', () => {
    const onCue = vi.fn()
    const onFooter = vi.fn()
    const { look } = setupCue(onCue, onFooter)
    look(400, window.innerHeight - 20)
    vi.advanceTimersByTime(500)
    look(400, window.innerHeight - 48 - 80)
    vi.advanceTimersByTime(1100)
    expect(onCue).not.toHaveBeenCalled()
    expect(onFooter).toHaveBeenCalledTimes(1)
  })
})
