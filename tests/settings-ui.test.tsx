// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from '../src/renderer/src/App'
import { DEFAULT_SETTINGS } from '../src/shared/settings'
import { installGeminiMock } from './prediction-fixture'

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
  delete window.gemini
  localStorage.clear()
})

it('loads, searches, and saves the chosen phrase model and restores its displayed selection', async () => {
  installGeminiMock()
  const models = vi.spyOn(window.gemini!, 'models')
  const save = vi.spyOn(window.gemini!, 'setModel')
  const view = render(<App />)
  openSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Gemini', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Choose phrase model' }), { detail: 1 })
  await waitFor(() => expect(models).toHaveBeenCalledOnce())
  const choice = await screen.findByRole('button', { name: 'Alternative model (test/alternative)' })
  fireEvent.change(screen.getByLabelText('Find a model'), { target: { value: 'alternative' } })
  fireEvent.click(choice, { detail: 1 })
  await waitFor(() => expect(save).toHaveBeenCalledWith('test/alternative'))
  await waitFor(() => expect(screen.getByText('Phrase model: test/alternative')).toBeTruthy())
  view.unmount()
  render(<App />)
  openSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Gemini', exact: true }), { detail: 1 })
  await waitFor(() => expect(screen.getByText('Phrase model: test/alternative')).toBeTruthy())
})

it('keeps the current model on a failed save and offers retry after a catalog failure', async () => {
  installGeminiMock()
  vi.spyOn(window.gemini!, 'models').mockRejectedValueOnce(Error('offline'))
  vi.spyOn(window.gemini!, 'setModel').mockRejectedValue(Error('disk full'))
  render(<App />)
  openSettings()
  fireEvent.click(screen.getByRole('button', { name: 'Gemini', exact: true }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Choose phrase model' }), { detail: 1 })
  expect(await screen.findByText(/Could not load OpenRouter models/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reload models' }), { detail: 1 })
  fireEvent.click(
    await screen.findByRole('button', { name: 'Alternative model (test/alternative)' }),
    { detail: 1 }
  )
  expect(await screen.findByText(/Could not save the phrase model/)).toBeTruthy()
  expect(screen.queryByText('Phrase model: test/alternative')).toBeNull()
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
