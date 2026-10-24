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
import { streamGemini } from './gemini'
import { validRequest } from '../shared/predictionValidation'
import type { GeminiStatus } from '../shared/prediction'

export function installGeminiIpc(window: BrowserWindow): void {
  let key = process.env.OPENROUTER_TOKEN ?? ''
  if (!key) {
    try {
      key = parseEnv(readFileSync(join(app.getAppPath(), '.env'), 'utf8')).OPENROUTER_TOKEN ?? ''
    } catch {
      /* Missing .env is surfaced through the configuration status, never a log. */
    }
  }
  let enabled = false
  let active: { id: string; controller: AbortController } | null = null
  const cancel = (): void => {
    active?.controller.abort()
    active = null
  }
  const status = (): GeminiStatus => ({ configured: !!key, enabled })
  const own = (event: IpcMainInvokeEvent | IpcMainEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  ipcMain.handle('gemini:status', (event) => {
    if (!own(event)) throw new Error('Unauthorized sender')
    return status()
  })
  ipcMain.handle('gemini:enabled', (event, value: unknown) => {
    if (!own(event) || typeof value !== 'boolean') throw new Error('Invalid settings request')
    enabled = value
    if (!enabled) cancel()
    return status()
  })
  ipcMain.handle('gemini:start', (event, value: unknown) => {
    if (!own(event) || !validRequest(value)) throw new Error('Invalid prediction request')
    cancel()
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
    void streamGemini(value, key, controller.signal, (result) => {
      if (active?.controller === controller && !controller.signal.aborted && !window.isDestroyed())
        window.webContents.send('gemini:result', result)
    }).finally(() => {
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
    for (const channel of ['gemini:status', 'gemini:enabled', 'gemini:start'])
      ipcMain.removeHandler(channel)
    ipcMain.removeListener('gemini:cancel', onCancel)
  })
}
