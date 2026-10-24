// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/renderer/src/App'
import { DEFAULT_SETTINGS } from '../src/shared/settings'

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
  delete window.settings
  localStorage.clear()
})

function openSettings(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Menu', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Settings', exact: true }), { detail: 1 })
}

it('saves changed controls immediately and restores them on the next launch', async () => {
  let saved = { ...DEFAULT_SETTINGS }
  window.settings = {
    load: async () => ({ ...saved }),
    save: vi.fn(async (patch) => {
      saved = { ...saved, ...patch }
    })
  }
  const view = render(<App initialSettings={await window.settings.load()} />)
  openSettings()
  fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'dark' } })
  fireEvent.change(screen.getByLabelText('Letter prediction'), { target: { value: 'uniform' } })
  fireEvent.change(screen.getByLabelText('Edge target size'), { target: { value: '88' } })
  fireEvent.change(screen.getByLabelText('Dwell time'), { target: { value: '1500' } })
  fireEvent.change(screen.getByLabelText('Dwell activation'), { target: { value: 'false' } })
  fireEvent.click(screen.getByRole('button', { name: 'Standard', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Faster', exact: true }), { detail: 1 })
  await waitFor(() => expect(window.settings?.save).toHaveBeenCalledTimes(6))
  view.unmount()
  render(<App initialSettings={await window.settings.load()} />)
  openSettings()
  expect((screen.getByLabelText('Appearance') as HTMLSelectElement).value).toBe('dark')
  expect((screen.getByLabelText('Letter prediction') as HTMLSelectElement).value).toBe('uniform')
  expect((screen.getByLabelText('Edge target size') as HTMLSelectElement).value).toBe('88')
  expect((screen.getByLabelText('Dwell time') as HTMLSelectElement).value).toBe('1500')
  expect((screen.getByLabelText('Dwell activation') as HTMLSelectElement).value).toBe('false')
  expect(screen.getByRole('button', { name: 'Faster', exact: true })).toBeTruthy()
})

it('reports failed saves while leaving composition available', async () => {
  window.settings = {
    load: async () => ({ ...DEFAULT_SETTINGS }),
    save: vi.fn().mockRejectedValue(Error('disk full'))
  }
  render(<App />)
  openSettings()
  fireEvent.change(screen.getByLabelText('Appearance'), { target: { value: 'dark' } })
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('could not be saved'))
  expect(screen.getByLabelText('Appearance')).toBeTruthy()
})
