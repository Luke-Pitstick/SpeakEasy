import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installGeminiIpc } from '../src/main/geminiIpc'
import { SettingsStore } from '../src/main/settings'
import { streamGemini } from '../src/main/gemini'
import type { PredictionRequest } from '../src/shared/prediction'
import type { ApprovedPreference } from '../src/shared/preferences'
import { PreferenceStore } from '../src/main/preferenceStore'

const state = vi.hoisted(() => ({
  folder: '',
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  reconcile: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  retrieve: vi.fn()
}))
vi.mock('../src/main/preferenceProvider', () => ({ extractPreferences: vi.fn(async () => []) }))
vi.mock('electron', () => ({
  app: { getPath: () => state.folder, getAppPath: () => state.folder },
  ipcMain: {
    handle: (name: string, fn: (...args: unknown[]) => unknown) => state.handlers.set(name, fn),
    removeHandler: (name: string) => state.handlers.delete(name),
    on: vi.fn(),
    removeListener: vi.fn()
  }
}))
vi.mock('../src/main/mossMemory', () => ({
  modelContextResolver: vi.fn(),
  openMossMemory: vi.fn(async () => ({
    memory: { retrieve: state.retrieve, reconcile: state.reconcile },
    close: state.close
  }))
}))
vi.mock('../src/main/gemini', () => ({ streamGemini: vi.fn(async () => {}) }))
const closes: (() => void)[] = []
afterEach(async () => {
  closes.splice(0).forEach((close) => close())
  await new Promise((r) => setTimeout(r, 0))
  vi.unstubAllEnvs()
  state.handlers.clear()
  vi.clearAllMocks()
  if (state.folder) rmSync(state.folder, { recursive: true, force: true })
})

it('uses selected context over IPC, rejects untrusted histories, and clears the local projection', async () => {
  for (const name of ['OPENROUTER_TOKEN', 'MOSS_PROJECT_ID', 'MOSS_PROJECT_TOKEN'])
    vi.stubEnv(name, 'test-only')
  state.folder = mkdtempSync(join(tmpdir(), 'moss-ipc-'))
  const frame = { url: 'file:///test/index.html' }
  const contents = { mainFrame: frame, getURL: () => frame.url, on: vi.fn(), send: vi.fn() }
  const window = {
    isDestroyed: () => false,
    webContents: contents,
    on: (name: string, close: () => void) => {
      if (name === 'closed') closes.push(close)
    }
  } as unknown as Parameters<typeof installGeminiIpc>[0]
  const settings = new SettingsStore(join(state.folder, 'settings.json'))
  settings.save({ geminiEnabled: true })
  const saved = new PreferenceStore(join(state.folder, 'preferences.sqlite'))
  const approved: ApprovedPreference = {
    id: 'food',
    fact: {
      type: 'preference',
      subject: 'user',
      relationship: 'favorite_food',
      value: 'curry',
      scope: { game: null, topic: 'dinner' },
      relatedTerms: []
    },
    source: { id: 'source', text: 'I like curry', initials: 'ilc', createdAt: 1 },
    quote: 'I like curry',
    scopeBasis: 'explicit',
    scopeExplanation: '',
    updatedAt: 1
  }
  saved.save(approved)
  saved.close()
  installGeminiIpc(window, settings)
  expect(state.handlers.has('gemini:moss-enabled')).toBe(false)
  expect(state.handlers.has('gemini:summarize')).toBe(false)
  const event = { sender: contents, senderFrame: frame }
  const call = (name: string, input?: unknown): unknown => state.handlers.get(name)!(event, input)
  const request: PredictionRequest = {
    id: 'request',
    revision: 1,
    purpose: 'expansion',
    lockedMessage: '',
    draft: '',
    target: { start: 0, end: 0 },
    conversation: [{ id: 'dinner', speaker: 'partner', text: 'What would you like for dinner?' }],
    tokens: [...'iwac'].map((value, i) => ({ id: String(i), kind: 'initial', value }))
  }
  const sample = { request, history: request.conversation }
  await expect(state.handlers.get('gemini:context')!({}, [])).rejects.toThrow('Unauthorized')
  await expect(call('gemini:context', Array(501).fill(sample.history[0]))).rejects.toThrow()
  await call('gemini:context', sample.history)
  expect(state.reconcile).toHaveBeenLastCalledWith(sample.history, [approved])
  const selected = {
    ...sample.request,
    conversation: sample.history.slice(-1)
  }
  state.retrieve.mockResolvedValue({
    request: selected,
    facts: [],
    context: null,
    decision: {},
    factIds: [],
    candidates: [],
    timings: {},
    cacheHit: false
  })
  call('gemini:start', { ...sample.request, conversationHistory: sample.history })
  await new Promise((r) => setTimeout(r, 0))
  expect(vi.mocked(streamGemini).mock.calls.at(-1)?.[0]).toEqual(selected)
  expect(state.retrieve.mock.calls.at(-1)?.[2]).toEqual([approved])
  await call('preferences:update', { type: 'settings', retrieve: false })
  await new Promise((r) => setTimeout(r, 0))
  expect(state.reconcile).toHaveBeenLastCalledWith(sample.history, [])
  await call('preferences:update', { type: 'settings', retrieve: true })
  await new Promise((r) => setTimeout(r, 0))
  expect(state.reconcile).toHaveBeenLastCalledWith(sample.history, [approved])
  await call('gemini:context', [])
  expect(state.reconcile).toHaveBeenLastCalledWith([], [approved])
  state.retrieve.mockRejectedValueOnce(Error('Moss unavailable'))
  call('gemini:start', { ...sample.request, id: 'unavailable', draft: '' })
  await new Promise((r) => setTimeout(r, 0))
  expect(streamGemini).toHaveBeenCalledTimes(1)
  expect(contents.send).toHaveBeenCalledWith(
    'gemini:result',
    expect.objectContaining({
      requestId: 'unavailable',
      status: 'error',
      message: expect.stringContaining('Your message is intact')
    })
  )
  call('gemini:enabled', false)
  await new Promise((r) => setTimeout(r, 0))
  expect(settings.read().geminiEnabled).toBe(false)
  expect(state.close).toHaveBeenCalledTimes(1)
})
