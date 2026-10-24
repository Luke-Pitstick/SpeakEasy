// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/renderer/src/App'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('identifies the trained predictor and pauses before changing the prediction condition', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Start writing' }))
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Pause Dasher')
  fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }))
  expect(screen.getByText('Trained initials PPM · 10% smoothing')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Letter prediction'), { target: { value: 'uniform' } })
  expect(screen.getByText('Uniform letters')).toBeTruthy()
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Resume Dasher')
  fireEvent.change(screen.getByLabelText('Letter prediction'), { target: { value: 'ppm' } })
  expect(screen.getByText('Trained initials PPM · 10% smoothing')).toBeTruthy()
  expect(screen.getByTestId('dasher-surface').getAttribute('aria-label')).toBe('Resume Dasher')
})

it('keeps exact spelling on the character predictor', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Exact spelling', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }))
  expect(screen.getByText('Character PPM')).toBeTruthy()
  expect(screen.queryByText('Trained initials PPM · 10% smoothing')).toBeNull()
})
