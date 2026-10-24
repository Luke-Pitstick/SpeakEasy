import { diagnostics } from './diagnosticStore'
import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { PreferenceStore } from './preferenceStore'
import { PreferenceService } from './preferenceService'
import { preferenceOperationSchema, type PreferenceSnapshot } from '../shared/preferences'
import { PhraseCache, validPhrase } from './phraseCache'

export function installPreferenceIpc(
  window: BrowserWindow,
  key: string,
  cancelGeneration: () => void,
  cache: PhraseCache | null
): PreferenceService | null {
  let service: PreferenceService | null = null
  try {
    service = new PreferenceService(
      new PreferenceStore(join(app.getPath('userData'), 'preferences.sqlite')),
      key,
      (invalidate = false) => {
        if (invalidate) cancelGeneration()
        if (!window.isDestroyed()) window.webContents.send('preferences:changed', invalidate)
      }
    )
  } catch {
    /* Exposed by read; composition remains available. */
  }
  const own = (event: IpcMainInvokeEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  ipcMain.handle('preferences:read', (event): PreferenceSnapshot => {
    if (!own(event)) throw Error('Unauthorized sender')
    if (service) return service.read()
    return {
      extract: false,
      retrieve: false,
      facts: [],
      proposals: [],
      sentences: [],
      unindexed: 0,
      busy: false,
      error: 'Preference storage unavailable. Restart or continue composing without memory.'
    }
  })
  ipcMain.handle('preferences:update', async (event, value: unknown) => {
    if (!own(event)) throw Error('Unauthorized sender')
    const parsed = preferenceOperationSchema.safeParse(value)
    if (!parsed.success || !service)
      throw Error('Invalid preference operation or unavailable storage')
    const operation = parsed.data
    const before = service.read().sentences
    if (operation.type !== 'commit') diagnostics.clear()
    const result = await service.update(operation)
    if (operation.type === 'commit' && !before.some((s) => s.id === operation.id)) {
      const source = result.sentences.find((s) => s.id === operation.id)
      if (source && validPhrase(source.initials, source.text))
        cache?.save(source.initials, source.text)
    }
    if (operation.type === 'forget-sentences')
      for (const source of before.filter((s) => operation.ids.includes(s.id)))
        cache?.retract(source.initials, source.text)
    if (operation.type === 'clear') cache?.clear()
    return result
  })
  window.on('closed', () => {
    service?.close()
    ipcMain.removeHandler('preferences:read')
    ipcMain.removeHandler('preferences:update')
  })
  return service
}
