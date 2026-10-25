import { afterEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installGeminiIpc } from '../src/main/geminiIpc'
import { SettingsStore } from '../src/main/settings'
import { streamGemini } from '../src/main/gemini'

const mocked = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  folder: ''
}))
vi.mock('../src/main/mossMemory', () => ({
  modelContextResolver: vi.fn(),
  openMossMemory: vi.fn(async () => ({
    memory: {
      retrieve: vi.fn(async (request) => ({
        request,
        facts: [],
        context: null,
        decision: {},
        factIds: [],
        candidates: [],
        timings: {},
        cacheHit: false
      })),
      reconcile: vi.fn(async () => {})
    },
    close: vi.fn(async () => {})
  }))
}))
vi.mock('../src/main/preferenceProvider', () => ({ extractPreferences: vi.fn(async () => []) }))
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
vi.mock('../src/main/gemini', () => ({ streamGemini: vi.fn(async () => {}) }))
const closes: (() => void)[] = []
afterEach(() => {
  closes.splice(0).forEach((close) => close())
  mocked.handlers.clear()
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  if (mocked.folder) rmSync(mocked.folder, { recursive: true, force: true })
})

function launch(): { event: object; send: ReturnType<typeof vi.fn> } {
  vi.stubEnv('MOSS_PROJECT_ID', 'test-project')
  vi.stubEnv('MOSS_PROJECT_TOKEN', 'test-key')
  vi.stubEnv('OPENROUTER_TOKEN', 'test-token')
  mocked.folder = mkdtempSync(join(tmpdir(), 'speakeasy-memory-ipc-'))
  const frame = { url: 'file:///speakeasy/index.html' }
  const send = vi.fn()
  const contents = { mainFrame: frame, getURL: () => frame.url, on: vi.fn(), send }
  const window = {
    isDestroyed: () => false,
    webContents: contents,
    on: (name: string, callback: () => void) => {
      if (name === 'closed') closes.push(callback)
    }
  } as unknown as Parameters<typeof installGeminiIpc>[0]
  const settings = new SettingsStore(join(mocked.folder, 'settings.json'))
  settings.save({ geminiEnabled: true })
  installGeminiIpc(window, settings)
  return { event: { sender: contents, senderFrame: frame }, send }
}

it('enforces sender and input validation, independent sharing consent, and in-flight cancellation', async () => {
  const { event, send } = launch()
  const call = (channel: string, value?: unknown): unknown =>
    mocked.handlers.get(channel)!(event, value)
  expect(() => mocked.handlers.get('memory:read')!({})).toThrow('Unauthorized')
  expect(() => call('memory:update', { type: 'forget-word', word: 'two words' })).toThrow('Invalid')
  expect(() =>
    call('memory:update', { type: 'learn', id: 'x', correction: { before: '', after: 'Anjali' } })
  ).toThrow('Invalid')
  expect(() => call('memory:update', { type: 'settings', learning: 'yes', cloud: true })).toThrow(
    'Invalid'
  )
  call('memory:update', { type: 'settings', learning: true, cloud: false })
  call('memory:update', {
    type: 'learn',
    id: 'correction',
    correction: { before: 'I want Andrew', after: 'I want Anjali' }
  })
  const request = {
    id: 'one',
    revision: 1,
    purpose: 'expansion',
    lockedMessage: '',
    draft: '',
    target: { start: 0, end: 0 },
    conversation: [],
    tokens: ['c', 'w', 'c', 'a'].map((value, i) => ({ id: String(i), kind: 'initial', value }))
  }
  call('gemini:start', request)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.mocked(streamGemini).mock.calls.at(-1)?.[5]).toEqual({
    vocabulary: [],
    examples: [],
    facts: []
  })
  call('memory:update', { type: 'settings', learning: true, cloud: true })
  call('gemini:start', { ...request, id: 'two' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  const generation = vi.mocked(streamGemini).mock.calls.at(-1)!
  expect(generation[5]?.vocabulary).toContain('Anjali')
  send.mockClear()
  call('memory:update', { type: 'forget-word', word: 'ANJALI' })
  expect(generation[2].aborted).toBe(true)
  expect(send).toHaveBeenCalledWith('memory:changed', true)
  generation[3]({
    requestId: 'two',
    revision: 1,
    purpose: 'expansion',
    provider: 'gemini',
    elapsedMs: 1,
    status: 'success',
    complete: true,
    candidates: []
  })
  expect(send).not.toHaveBeenCalledWith('gemini:result', expect.anything())
  call('gemini:start', { ...request, id: 'three' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(vi.mocked(streamGemini).mock.calls.at(-1)?.[5]).toEqual({
    vocabulary: [],
    examples: [],
    facts: []
  })
})

it.each(['locked message', 'partner question'])(
  'publishes two cache matches immediately while preserving contextual generation: %s',
  async (context) => {
    const { event, send } = launch()
    const save = mocked.handlers.get('preferences:update')!
    for (const [i, text] of [
      'I prefer hot chicken',
      'I pick hot chicken',
      'I prefer hearty chicken',
      'I prefer healthy chicken',
      'I prefer homemade chicken',
      'I prefer home cooking'
    ].entries()) {
      await save(event, { type: 'commit', id: `saved-${i}`, text, conversation: [] })
    }
    const input = {
      id: 'continuation',
      revision: 1,
      purpose: 'expansion',
      draft: '',
      lockedMessage:
        context === 'locked message'
          ? 'I have been playing Clash Royale. Let me tell you about my favorite deck.'
          : '',
      target: { start: 0, end: 0 },
      tokens: [...'iphc'].map((value, i) => ({ id: String(i), kind: 'initial', value })),
      conversation: [
        {
          id: 'background',
          speaker: 'partner',
          text:
            context === 'locked message'
              ? 'What is for dinner?'
              : 'Which Clash Royale deck do you play?'
        }
      ]
    }
    send.mockClear()
    mocked.handlers.get('gemini:start')!(event, input)
    expect(send).toHaveBeenCalledWith(
      'gemini:result',
      expect.objectContaining({
        complete: false,
        candidates: expect.any(Array)
      })
    )
    const immediate = send.mock.calls.find(([channel]) => channel === 'gemini:result')![1]
    expect(immediate.candidates).toHaveLength(2)
    expect(streamGemini).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(streamGemini).toHaveBeenCalledOnce()
    const generation = vi.mocked(streamGemini).mock.calls[0]
    expect(generation[0].lockedMessage).toBe(input.lockedMessage)
    expect(generation[6]).toHaveLength(2)
    expect(send).toHaveBeenCalledWith(
      'gemini:result',
      expect.objectContaining({
        complete: false,
        candidates: generation[6]
      })
    )
    mocked.handlers.get('gemini:enabled')!(event, false)
    mocked.handlers.get('gemini:start')!(event, { ...input, id: 'offline' })
    expect(send).toHaveBeenCalledWith(
      'gemini:result',
      expect.objectContaining({
        status: 'success',
        complete: true,
        candidates: expect.any(Array)
      })
    )
    expect(streamGemini).toHaveBeenCalledOnce()
  }
)
