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
  localStorage.clear()
})

it('offers mouse, eye tracker and head pointer as inputs, defaulting to the mouse', () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }))
  const input = screen.getByLabelText('Input') as HTMLSelectElement
  expect([...input.options].map((o) => o.textContent)).toEqual([
    'Mouse',
    'Eye tracker (webcam)',
    'Head pointer (webcam)'
  ])
  expect(input.value).toBe('mouse')
})
