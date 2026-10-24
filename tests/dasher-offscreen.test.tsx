// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/renderer/src/App'

beforeEach(() => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  // A fixed layout so pointer positions inside the Dasher surface are valid samples.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1100,
    height: 330,
    right: 1100,
    bottom: 330,
    toJSON: () => ({})
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function startWriting(): HTMLElement {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Keep writing' }))
  fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
  const surface = screen.getByTestId('dasher-surface')
  fireEvent.pointerMove(surface, { clientX: 700, clientY: 165 })
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')
  return surface
}

it('keeps steering when the pointer leaves the window', () => {
  const surface = startWriting()
  // Leaving the window: no element is entered.
  fireEvent.pointerLeave(surface, { relatedTarget: null })
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')
})

it('holds instead of pausing when the pointer moves onto other controls', () => {
  const surface = startWriting()
  const menu = screen.getByRole('button', { name: 'Menu', exact: true })
  fireEvent.pointerLeave(surface, { relatedTarget: menu })
  fireEvent.pointerEnter(screen.getByLabelText('Message and controls'))
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')
})

/** Runs queued animation frames at a fixed 16 ms cadence. */
function frames(): (ms: number) => void {
  let queued: FrameRequestCallback[] = []
  let now = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    queued.push(callback)
    return queued.length
  })
  return (ms) => {
    for (const end = now + ms; now < end;) {
      now += 16
      const pending = queued
      queued = []
      act(() => pending.forEach((callback) => callback(now)))
    }
  }
}

it('resumes when the pointer rests near the crosshair after a pause', () => {
  const run = frames()
  const surface = startWriting()
  fireEvent.click(surface, { clientX: 900, clientY: 165 })
  expect(surface.getAttribute('aria-label')).toBe('Resume Dasher')
  run(100)
  fireEvent.pointerMove(surface, { clientX: 560, clientY: 170 })
  run(300)
  expect(surface.getAttribute('aria-label')).toBe('Resume Dasher')
  run(300)
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')
})

it('does not undo a pause made at the crosshair until the pointer has moved away', () => {
  const run = frames()
  const surface = startWriting()
  fireEvent.click(surface, { clientX: 550, clientY: 165 })
  run(1000)
  expect(surface.getAttribute('aria-label')).toBe('Resume Dasher')
  fireEvent.pointerMove(surface, { clientX: 900, clientY: 165 })
  run(50)
  fireEvent.pointerMove(surface, { clientX: 550, clientY: 165 })
  run(600)
  expect(surface.getAttribute('aria-label')).toBe('Pause Dasher')
})
