import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installSettingsIpc } from '../src/main/settingsIpc'
import { installGeminiIpc } from '../src/main/geminiIpc'

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  folder: ''
}))
vi.mock('electron', () => ({
  app: { getPath: () => mocked.folder, getAppPath: () => mocked.folder },
  ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) =>
      mocked.handlers.set(name, handler),
    removeHandler: (name: string) => mocked.handlers.delete(name),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))

afterEach(() => {
  mocked.handlers.clear()
  vi.unstubAllEnvs()
  if (mocked.folder) rmSync(mocked.folder, { recursive: true, force: true })
})

function launch(): { event: object; close: () => void } {
  const closed: (() => void)[] = []
  const frame = { url: 'file:///speakeasy/index.html' }
  const contents = { mainFrame: frame, getURL: () => frame.url, on: vi.fn(), send: vi.fn() }
  const window = {
    isDestroyed: () => false,
    webContents: contents,
    on: (name: string, callback: () => void) => {
      if (name === 'closed') closed.push(callback)
    }
  } as unknown as Parameters<typeof installSettingsIpc>[0]
  installGeminiIpc(window, installSettingsIpc(window))
  return {
    event: { sender: contents, senderFrame: frame },
    close: () => closed.forEach((fn) => fn())
  }
}

it('restores Gemini consent and general settings after closing and creating a new window', () => {
  vi.stubEnv('OPENROUTER_TOKEN', '')
  mocked.folder = mkdtempSync(join(tmpdir(), 'speakeasy-settings-ipc-'))
  const first = launch()
  expect(mocked.handlers.get('gemini:status')!(first.event)).toMatchObject({ enabled: false })
  mocked.handlers.get('settings:save')!(first.event, { theme: 'dark', dwell: false })
  mocked.handlers.get('gemini:enabled')!(first.event, true)
  expect(() => mocked.handlers.get('settings:save')!({}, { theme: 'light' })).toThrow()
  expect(() =>
    mocked.handlers.get('settings:save')!(first.event, { geminiEnabled: false })
  ).toThrow()
  first.close()
  expect(mocked.handlers.size).toBe(0)
  const second = launch()
  expect(mocked.handlers.get('settings:load')!(second.event)).toMatchObject({
    theme: 'dark',
    dwell: false
  })
  expect(mocked.handlers.get('gemini:status')!(second.event)).toMatchObject({ enabled: true })
  mocked.handlers.get('gemini:enabled')!(second.event, false)
  second.close()
  const third = launch()
  expect(mocked.handlers.get('gemini:status')!(third.event)).toMatchObject({ enabled: false })
  third.close()
})

it('retrieves locked sentences before speech without cloud access and rejects untrusted saves', async () => {
  vi.stubEnv('OPENROUTER_TOKEN', '')
  mocked.folder = mkdtempSync(join(tmpdir(), 'speakeasy-cache-ipc-'))
  const app = launch()
  const save = mocked.handlers.get('preferences:update')!
  const commit = { type: 'commit', id: 'one', text: 'I want a coffee', conversation: [] }
  await expect(save({}, commit)).rejects.toThrow('Unauthorized')
  await expect(save(app.event, { ...commit, text: '' })).rejects.toThrow('Invalid')
  await save(app.event, commit)
  const input = {
    id: 'cached',
    revision: 0,
    purpose: 'expansion',
    lockedMessage: '',
    draft: '',
    target: { start: 0, end: 0 },
    conversation: [],
    tokens: [...'iwac'].map((value, i) => ({ id: String(i), kind: 'initial', value }))
  }
  mocked.handlers.get('gemini:start')!(app.event, input)
  const send = (app.event as { sender: { send: ReturnType<typeof vi.fn> } }).sender.send
  expect(send).toHaveBeenLastCalledWith(
    'gemini:result',
    expect.objectContaining({
      status: 'success',
      complete: true,
      candidates: [expect.objectContaining({ text: 'I want a coffee' })]
    })
  )
  mocked.handlers.get('gemini:clear-cache')!(app.event)
  mocked.handlers.get('gemini:start')!(app.event, input)
  expect(send).toHaveBeenLastCalledWith(
    'gemini:result',
    expect.objectContaining({ status: 'error' })
  )
  app.close()
})
