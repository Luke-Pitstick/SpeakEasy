import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../src/main/settings'
import { installJevIpc } from '../src/main/jevIpc'

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  listeners: new Map<string, (...args: unknown[]) => unknown>(),
  folder: ''
}))
vi.mock('electron', () => ({
  app: { getAppPath: () => mocked.folder },
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => mocked.handlers.set(name, fn),
    on: (name: string, fn: (...args: unknown[]) => unknown) => mocked.listeners.set(name, fn),
    removeHandler: (name: string) => mocked.handlers.delete(name),
    removeListener: (name: string) => mocked.listeners.delete(name)
  }
}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  mocked.handlers.clear()
  mocked.listeners.clear()
  rmSync(mocked.folder, { recursive: true, force: true })
})
function launch(): { event: object; close: () => void; store: SettingsStore } {
  mocked.folder = mkdtempSync(join(tmpdir(), 'speakeasy-tone-ipc-'))
  vi.stubEnv('TYPESAFE_AI_API_TOKEN', 'test-token')
  const frame = { url: 'file:///speakeasy/index.html' }
  const contents = { mainFrame: frame, getURL: () => frame.url, on: vi.fn() }
  let close = (): void => {}
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    on: (_name: string, fn: () => void) => {
      close = fn
    }
  }
  const store = new SettingsStore(join(mocked.folder, 'settings.json'))
  installJevIpc(window as never, store)
  return { event: { sender: contents, senderFrame: frame }, close, store }
}
const request = { id: 'one', revision: 3, contextEpoch: 1, text: 'Thank you!', conversation: [] }
it('enforces sender, consent and payload boundaries before any provider call and persists consent', async () => {
  const app = launch(),
    fetcher = vi.fn()
  vi.stubGlobal('fetch', fetcher)
  const suggest = mocked.handlers.get('tone:suggest')!,
    enabled = mocked.handlers.get('tone:enabled')!
  await expect(suggest(app.event, request)).rejects.toThrow('Enable and configure')
  expect(() => enabled({}, true)).toThrow('Invalid tone setting')
  enabled(app.event, true)
  expect(app.store.read().toneSuggestionsEnabled).toBe(true)
  await expect(suggest({}, request)).rejects.toThrow()
  await expect(suggest(app.event, { ...request, text: 'a'.repeat(2001) })).rejects.toThrow(
    'Invalid tone request'
  )
  expect(fetcher).not.toHaveBeenCalled()
  app.close()
  expect(mocked.handlers.size).toBe(0)
})
it('cancels on disable and rejects late results even if the provider ignores abort', async () => {
  const app = launch()
  let resolve!: (response: Response) => void
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Promise((yes) => {
        resolve = yes
      })
  )
  vi.stubGlobal('fetch', fetcher)
  mocked.handlers.get('tone:enabled')!(app.event, true)
  const result = mocked.handlers.get('tone:suggest')!(app.event, request)
  const rejected = expect(result).rejects.toThrow('Tone suggestion unavailable')
  mocked.handlers.get('tone:enabled')!(app.event, false)
  expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
  resolve(
    new Response(
      JSON.stringify({
        model: 'jev-test',
        answers: { tone: { type: 'choice', choice: 'happy', confidence: 0.9 } }
      })
    )
  )
  await rejected
  expect(app.store.read().toneSuggestionsEnabled).toBe(false)
  app.close()
})
