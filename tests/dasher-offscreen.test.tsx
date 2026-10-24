// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

it('pauses when the pointer moves onto other controls', () => {
  const surface = startWriting()
  fireEvent.pointerLeave(surface, {
    relatedTarget: screen.getByRole('button', { name: 'Menu', exact: true })
  })
  expect(surface.getAttribute('aria-label')).toBe('Resume Dasher')
})
