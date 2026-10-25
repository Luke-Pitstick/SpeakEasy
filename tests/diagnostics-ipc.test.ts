import { afterEach, expect, it, vi } from 'vitest'
import { installDiagnosticsIpc } from '../src/main/diagnosticsIpc'
import { diagnostics } from '../src/main/diagnosticStore'

const mocked = vi.hoisted(() => ({
  handlers: new Map(),
  listeners: new Map(),
  windows: [] as FakeWindow[]
}))
class FakeWindow {
  callbacks = new Map<string, () => void>()
  url = 'file:///app/index.html'
  frame = { url: this.url }
  webContents = {
    mainFrame: this.frame,
    getURL: () => this.url,
    setWindowOpenHandler: vi.fn(),
    on: vi.fn()
  }
  isDestroyed = (): boolean => false
  show = vi.fn()
  focus = vi.fn()
  on = (name: string, callback: () => void): void => {
    this.callbacks.set(name, callback)
  }
  loadFile = async (): Promise<void> => {
    this.url += '#debug'
    this.frame.url = this.url
  }
  destroy = (): void => {
    this.callbacks.get('closed')?.()
  }
  event = (): object => ({ sender: this.webContents, senderFrame: this.frame })
}
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function () {
    const window = new FakeWindow()
    mocked.windows.push(window)
    return window
  }),
  ipcMain: {
    handle: (name: string, fn: unknown) => mocked.handlers.set(name, fn),
    on: (name: string, fn: unknown) => mocked.listeners.set(name, fn),
    removeHandler: (name: string) => mocked.handlers.delete(name),
    removeListener: (name: string) => mocked.listeners.delete(name)
  }
}))
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))
afterEach(() => {
  mocked.handlers.clear()
  mocked.listeners.clear()
  mocked.windows = []
  diagnostics.stop()
})
it('limits open/context to the main renderer, read to the inspector, and clears data on close', async () => {
  const owner = new FakeWindow()
  installDiagnosticsIpc(owner as unknown as Parameters<typeof installDiagnosticsIpc>[0])
  const call = (name: string, event: object, value?: unknown): unknown =>
    mocked.handlers.get(`diagnostics:${name}`)(event, value)
  const context = {
    epoch: 0,
    revision: 1,
    draft: '',
    initials: '',
    lockedMessage: '',
    conversation: [],
    retainedTurnCount: 0,
    partial: '',
    queuedTranscripts: [],
    listening: '',
    paused: true,
    busy: false
  }
  await expect(call('open', {}, context)).rejects.toThrow('Unauthorized')
  await expect(call('open', owner.event(), { ...context, key: 'secret' })).rejects.toThrow()
  await call('open', owner.event(), context)
  const inspector = mocked.windows[0]
  expect(() => call('read', owner.event())).toThrow('Unauthorized')
  expect(call('read', inspector.event())).toMatchObject({ enabled: true, context })
  mocked.listeners.get('diagnostics:context')(inspector.event(), { ...context, draft: 'injected' })
  expect(diagnostics.read().context?.draft).toBe('')
  mocked.listeners.get('diagnostics:context')(owner.event(), { ...context, draft: 'valid' })
  expect(diagnostics.read().context?.draft).toBe('valid')
  await call('open', owner.event(), context)
  expect(mocked.windows).toHaveLength(1)
  owner.destroy()
  expect(diagnostics.read()).toEqual({ enabled: false, context: null, events: [] })
  expect(mocked.handlers.size).toBe(0)
})
