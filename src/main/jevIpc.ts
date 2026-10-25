import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { toneRequestSchema, type ToneStatus } from '../shared/tone'
import { requestTone } from './jev'
import type { SettingsStore } from './settings'

export function installJevIpc(window: BrowserWindow, settings: SettingsStore | null): void {
  let key = process.env.TYPESAFE_AI_API_TOKEN ?? ''
  if (!key) {
    try {
      key =
        parseEnv(readFileSync(join(app.getAppPath(), '.env'), 'utf8')).TYPESAFE_AI_API_TOKEN ?? ''
    } catch {
      /* Status reports missing configuration. */
    }
  }
  let enabled = settings?.read().toneSuggestionsEnabled ?? false
  let active: { id: string; controller: AbortController } | null = null
  const cancel = (): void => {
    active?.controller.abort()
    active = null
  }
  const own = (event: IpcMainInvokeEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  const status = (): ToneStatus => ({ configured: !!key, enabled })
  ipcMain.handle('tone:status', (event) => {
    if (!own(event)) throw Error('Invalid tone request sender')
    return status()
  })
  ipcMain.handle('tone:enabled', (event, value: unknown) => {
    if (!own(event) || typeof value !== 'boolean') throw Error('Invalid tone setting')
    if (!settings) throw Error('Tone settings storage is unavailable')
    settings.save({ toneSuggestionsEnabled: value })
    enabled = value
    cancel()
    return status()
  })
  ipcMain.handle('tone:suggest', async (event, value: unknown) => {
    if (!own(event) || !enabled || !key)
      throw Error('Enable and configure Jev tone suggestions first')
    const parsed = toneRequestSchema.safeParse(value)
    if (!parsed.success) throw Error('Invalid tone request')
    cancel()
    const pending = { id: parsed.data.id, controller: new AbortController() }
    active = pending
    try {
      const proposal = await requestTone(key, parsed.data, pending.controller.signal)
      if (active !== pending || pending.controller.signal.aborted) throw Error('Cancelled')
      return proposal
    } catch {
      throw Error(
        'Tone suggestion unavailable. Check Jev access and connection, or choose a tone manually.'
      )
    } finally {
      if (active === pending) active = null
    }
  })
  const cancelRequest = (event: IpcMainInvokeEvent, id: unknown): void => {
    if (own(event) && typeof id === 'string' && id === active?.id) cancel()
  }
  ipcMain.on('tone:cancel', cancelRequest)
  window.webContents.on('did-start-navigation', cancel)
  window.on('closed', () => {
    cancel()
    for (const channel of ['tone:status', 'tone:enabled', 'tone:suggest'])
      ipcMain.removeHandler(channel)
    ipcMain.removeListener('tone:cancel', cancelRequest)
  })
}
