import type { PreferenceSnapshot } from '../shared/preferences'
import { openMossMemory, modelContextResolver } from './mossMemory'
import { conversationHistorySchema } from '../shared/conversationHistory'
import type { ConversationTurn } from '../shared/prediction'
import { diagnostics } from './diagnosticStore'
import {
  app,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type IpcMainEvent
} from 'electron'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { join } from 'node:path'
import { listPhraseModels, streamGemini } from './gemini'
import { PhraseCache } from './phraseCache'
import { validRequest } from '../shared/predictionValidation'
import { EXPANSION_MODEL, validModelId, type GeminiStatus } from '../shared/prediction'
import type { SettingsStore } from './settings'
import { MemoryStore } from './memory'
import { installPreferenceIpc } from './preferenceIpc'
import {
  emptyMemory,
  validCorrection,
  validMemoryWord,
  type MemoryOperation,
  type MemorySnapshot
} from '../shared/memory'

export function installGeminiIpc(window: BrowserWindow, settings: SettingsStore | null): void {
  let phraseCache: PhraseCache | null = null
  try {
    phraseCache = new PhraseCache(join(app.getPath('userData'), 'phrase-cache.json'))
  } catch {
    /* Saving reports an actionable error; generation remains available. */
  }
  let memory: MemoryStore | null = null
  let memoryError = ''
  try {
    memory = new MemoryStore(join(app.getPath('userData'), 'memory.sqlite'))
  } catch {
    memoryError = 'Memory storage is unavailable. Composition still works without personalization.'
  }
  let env: Record<string, string | undefined> = { ...process.env }
  try {
    env = { ...parseEnv(readFileSync(join(app.getAppPath(), '.env'), 'utf8')), ...process.env }
  } catch {
    /* Status reports missing keys. */
  }
  const key = env.OPENROUTER_TOKEN ?? ''
  const mossConfigured = !!env.MOSS_PROJECT_ID && !!env.MOSS_PROJECT_TOKEN
  let moss: Promise<Awaited<ReturnType<typeof openMossMemory>>> | null = null
  let sourceHistory: ConversationTurn[] = []
  const openMoss = (): NonNullable<typeof moss> => {
    if (!mossConfigured) return Promise.reject(Error('Configure Moss project credentials'))
    if (!moss) {
      const pending = openMossMemory(
        env.MOSS_PROJECT_ID!,
        env.MOSS_PROJECT_TOKEN!,
        modelContextResolver(key)
      )
      moss = pending
      void pending.catch(() => {
        if (moss === pending) moss = null
      })
    }
    return moss
  }
  const closeMoss = (): void => {
    const previous = moss
    moss = null
    void previous?.then((runtime) => runtime.close()).catch(() => {})
  }
  let enabled = settings?.read().geminiEnabled ?? false
  let model = settings?.read().phraseModel ?? EXPANSION_MODEL
  let active: { id: string; controller: AbortController } | null = null
  const cancel = (): void => {
    if (active) diagnostics.record('cancel', { reason: 'Cancelled or superseded' }, active.id)
    active?.controller.abort()
    active = null
  }
  const status = (): GeminiStatus => ({
    configured: !!key,
    enabled,
    model,
    mossConfigured
  })
  const preferences = installPreferenceIpc(
    window,
    key,
    () => {
      cancel()
      const facts = permittedFacts()
      void moss?.then((runtime) => runtime.memory.reconcile(sourceHistory, facts)).catch(() => {})
    },
    phraseCache
  )
  const permittedFacts = (): PreferenceSnapshot['facts'] => {
    const snapshot = preferences?.read()
    return snapshot?.retrieve ? snapshot.facts : []
  }
  const own = (event: IpcMainInvokeEvent | IpcMainEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  const readMemory = (): MemorySnapshot => {
    try {
      if (memory) return { ...memory.read(), error: memoryError || undefined }
    } catch {
      memoryError = 'Could not read memory. Restart or continue without personalization.'
    }
    return {
      learning: false,
      cloud: false,
      revision: 0,
      records: [],
      forgottenWords: [],
      error: memoryError
    }
  }
  ipcMain.handle('memory:read', (event) => {
    if (!own(event)) throw Error('Unauthorized sender')
    return readMemory()
  })
  ipcMain.handle('memory:update', (event, value: unknown) => {
    if (!own(event) || !value || typeof value !== 'object') throw Error('Invalid memory operation')
    const op = value as MemoryOperation
    const validId = (id: unknown): id is string =>
      typeof id === 'string' && /^[a-zA-Z0-9:-]{1,150}$/.test(id)
    const valid =
      op.type === 'clear' ||
      (op.type === 'forget-word' && validMemoryWord(op.word)) ||
      (op.type === 'settings' &&
        typeof op.learning === 'boolean' &&
        typeof op.cloud === 'boolean') ||
      (op.type === 'learn' && validId(op.id) && validCorrection(op.correction)) ||
      (op.type === 'edit' &&
        validId(op.id) &&
        typeof op.text === 'string' &&
        op.text.trim().length > 0 &&
        op.text.length <= 500 &&
        ![...op.text].some((c) => c.charCodeAt(0) < 32)) ||
      (op.type === 'forget' &&
        Array.isArray(op.ids) &&
        op.ids.length <= 100 &&
        op.ids.every(validId))
    if (!valid) throw Error('Invalid memory operation')
    cancel()
    diagnostics.clear()
    try {
      if (!memory) throw Error('Unavailable')
      memory.update(op)
      memoryError = ''
    } catch {
      memoryError =
        'Could not update memory. Storage may be unavailable or full (2,000 corrections). Retry or continue without learning.'
    }
    window.webContents.send('memory:changed')
    return readMemory()
  })
  ipcMain.handle('gemini:status', (event) => {
    if (!own(event)) throw new Error('Unauthorized sender')
    return status()
  })
  ipcMain.handle('gemini:models', (event) => {
    if (!own(event)) throw Error('Unauthorized sender')
    return listPhraseModels()
  })
  ipcMain.handle('gemini:model', (event, value: unknown) => {
    if (!own(event) || !validModelId(value)) throw Error('Invalid phrase model')
    if (!settings) throw Error('Settings storage is unavailable')
    settings.save({ phraseModel: value })
    cancel()
    model = value
    return status()
  })
  ipcMain.handle('gemini:clear-cache', (event) => {
    if (!own(event)) throw Error('Unauthorized sender')
    cancel()
    if (!phraseCache) throw Error('Phrase cache unavailable')
    phraseCache.clear()
  })
  ipcMain.handle('gemini:enabled', (event, value: unknown) => {
    if (!own(event) || typeof value !== 'boolean') throw new Error('Invalid settings request')
    if (!settings) throw new Error('Settings storage is unavailable')
    settings.save({ geminiEnabled: value })
    enabled = value
    if (!enabled) {
      cancel()
      closeMoss()
    }
    return status()
  })
  ipcMain.handle('gemini:context', async (event, value: unknown) => {
    if (!own(event)) throw Error('Unauthorized sender')
    const history = conversationHistorySchema.parse(value)
    if (JSON.stringify(history) === JSON.stringify(sourceHistory)) return
    sourceHistory = history
    cancel()
    if (enabled && key) {
      const runtime = await openMoss()
      await runtime.memory.reconcile(sourceHistory, permittedFacts())
    }
  })
  ipcMain.handle('gemini:start', (event, value: unknown) => {
    if (!own(event) || !validRequest(value)) throw new Error('Invalid prediction request')
    cancel()
    sourceHistory = value.conversationHistory ?? value.conversation
    // Context must rank saved phrases too; initials and frequency cannot establish relevance.
    const cached =
      enabled && key && (value.lockedMessage.trim() || sourceHistory.length)
        ? []
        : (phraseCache?.lookup(value) ?? [])
    diagnostics.record('request', { model, request: value, cached }, value.id)
    if (cached.length && (!enabled || !key || cached.length === 6)) {
      event.sender.send('gemini:result', {
        requestId: value.id,
        revision: value.revision,
        purpose: value.purpose,
        provider: 'gemini',
        elapsedMs: 0,
        status: 'success',
        candidates: cached,
        complete: true
      })
      return
    }
    if (!enabled || !key) {
      event.sender.send('gemini:result', {
        requestId: value.id,
        revision: value.revision,
        purpose: value.purpose,
        provider: 'gemini',
        elapsedMs: 0,
        status: 'error',
        message: !enabled
          ? 'Enable Gemini in Conversation to request cloud suggestions.'
          : 'Set OPENROUTER_TOKEN in the app .env and restart to connect Gemini.'
      })
      return
    }
    const controller = new AbortController()
    active = { id: value.id, controller }
    const requestModel = model
    let personalMemory = emptyMemory()
    try {
      personalMemory = memoryError ? personalMemory : (memory?.retrieve(value) ?? personalMemory)
    } catch {
      memoryError = 'Could not retrieve memory. Suggestions continue without personalization.'
    }
    if (cached.length)
      window.webContents.send('gemini:result', {
        requestId: value.id,
        revision: value.revision,
        purpose: value.purpose,
        provider: 'gemini',
        elapsedMs: 0,
        status: 'success',
        candidates: cached,
        complete: false
      })
    void (async () => {
      const contextStarted = performance.now()
      const runtime = await openMoss()
      if (controller.signal.aborted) return
      const bundle = await runtime.memory.retrieve(
        value,
        sourceHistory,
        permittedFacts(),
        controller.signal
      )
      const effectiveRequest = bundle.request
      const facts = bundle.facts
      const preparedContext = bundle.context
      personalMemory = memoryError
        ? emptyMemory()
        : (memory?.retrieve(effectiveRequest) ?? emptyMemory())
      diagnostics.record(
        'retrieval',
        {
          engine: 'moss',
          decision: bundle.decision,
          selectedIds: bundle.factIds,
          candidates: bundle.candidates,
          timings: bundle.timings,
          cacheHit: bundle.cacheHit
        },
        value.id
      )
      const preparationMs = performance.now() - contextStarted
      if (controller.signal.aborted || active?.controller !== controller) return
      diagnostics.record('memory', { ...personalMemory, facts }, value.id)
      await streamGemini(
        effectiveRequest,
        key,
        controller.signal,
        (result) => {
          if (
            active?.controller === controller &&
            !controller.signal.aborted &&
            !window.isDestroyed()
          ) {
            result.elapsedMs += preparationMs
            diagnostics.record('result', result, value.id)
            window.webContents.send('gemini:result', result)
          }
        },
        fetch,
        { ...personalMemory, facts },
        cached,
        requestModel,
        preparedContext
      )
    })()
      .catch(() => {
        if (
          active?.controller === controller &&
          !controller.signal.aborted &&
          !window.isDestroyed()
        )
          window.webContents.send('gemini:result', {
            requestId: value.id,
            revision: value.revision,
            purpose: value.purpose,
            provider: 'gemini',
            elapsedMs: 0,
            status: 'error',
            message:
              'Memory context unavailable. Check Moss credentials and connection, then retry. Your message is intact and exact spelling remains available.'
          })
      })
      .finally(() => {
        controller.abort()
        if (active?.controller === controller) active = null
      })
  })
  const onCancel = (event: IpcMainEvent, id: unknown): void => {
    if (own(event) && typeof id === 'string' && active?.id === id) cancel()
  }
  ipcMain.on('gemini:cancel', onCancel)
  window.webContents.on('did-start-navigation', cancel)
  window.webContents.on('render-process-gone', cancel)
  window.on('closed', () => {
    cancel()
    closeMoss()
    memory?.close()
    ipcMain.removeHandler('gemini:clear-cache')
    for (const channel of [
      'gemini:status',
      'gemini:models',
      'gemini:model',
      'gemini:enabled',
      'gemini:start',
      'gemini:context',
      'memory:read',
      'memory:update'
    ])
      ipcMain.removeHandler(channel)
    ipcMain.removeListener('gemini:cancel', onCancel)
  })
}
