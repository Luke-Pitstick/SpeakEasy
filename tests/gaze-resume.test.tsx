// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/renderer/src/App'
import { GazePointerBridge } from '../src/renderer/src/eyetracking/gazePointerBridge'
import type { GazeTracker, TrackerState } from '../src/renderer/src/eyetracking/GazeTracker'
import type { GazePoint } from '../src/renderer/src/eyetracking/types'

// The real workspace driven through the real gaze bridge, so pointer events arrive in the order
// a browser produces them (out/leave/over/enter) rather than as isolated synthetic events.
let bridge: GazePointerBridge | null = null
let look: (x: number, y: number) => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // The top cue's region is the top 40 px; everything else spans the window.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const bottom = this.matches('[data-gaze-top-cue]') ? 40 : 600
    return {
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      width: 1100,
      height: bottom,
      right: 1100,
      bottom,
      toJSON: () => ({})
    }
  })
  const gazeListeners = new Set<(g: GazePoint) => void>()
  const tracker = {
    onGaze: (l: (g: GazePoint) => void) => {
      gazeListeners.add(l)
      return () => gazeListeners.delete(l)
    },
    subscribe: () => () => {},
    getState: () => ({ faceDetected: true }) as TrackerState
  } as unknown as GazeTracker
  look = (x, y) => {
    const g = { x, y, rawX: x, rawY: y, screenX: x, screenY: y, target: null, timestamp: 0 }
    act(() => gazeListeners.forEach((l) => l({ ...g, blinking: false, offscreen: false })))
  }
  bridge = new GazePointerBridge(tracker)
})
afterEach(() => {
  bridge?.stop()
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Layout: the top cue across the top 40 px, the writing surface or phrases below. */
function layout(): void {
  document.elementFromPoint = (_x: number, y: number) =>
    y < 40
      ? screen.getByRole('button', { name: /Show phrases|Keep writing/ })
      : (screen.queryByTestId('dasher-surface') as Element | null)?.closest('[hidden]')
        ? document.body
        : screen.getByTestId('dasher-surface')
}

function dwellTime(): void {
  act(() => {
    vi.advanceTimersByTime(1100)
  })
}

it('pauses for phrases and resumes writing on coming back', () => {
  render(<App />)
  layout()
  fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
  const surface = screen.getByTestId('dasher-surface')
  bridge!.start()
  look(700, 300)
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')

  // Look up at the top cue and dwell: phrases open and writing pauses.
  look(500, 10)
  dwellTime()
  expect(screen.getByRole('region', { name: 'SpeakFaster phrase composition' })).toBeTruthy()

  // Look down into phrases, back up at the cue, dwell to return: writing resumes.
  look(500, 300)
  look(500, 10)
  dwellTime()
  look(700, 300)
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Pause Dasher')
})

it('stays paused on coming back if writing was paused before', () => {
  render(<App />)
  layout()
  fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }))
  bridge!.start()
  look(700, 300)
  look(500, 10)
  dwellTime()
  look(500, 300)
  look(500, 10)
  dwellTime()
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Resume Dasher')
})

it('pauses for the menu and resumes writing on going back', () => {
  render(<App />)
  // Header Menu button below the cue; while the menu is open, its Back button is everywhere.
  document.elementFromPoint = (_x: number, y: number) =>
    screen.queryByRole('dialog')
      ? screen.getByRole('button', { name: 'Back' })
      : y < 40
        ? screen.getByRole('button', { name: /Show phrases|Keep writing/ })
        : y < 100
          ? screen.getByRole('button', { name: 'Menu', exact: true })
          : screen.getByTestId('dasher-surface')
  fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
  bridge!.start()
  look(700, 300)
  look(700, 70)
  dwellTime()
  expect(screen.getByRole('dialog')).toBeTruthy()
  look(700, 300)
  dwellTime()
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Pause Dasher')
})
