import { app, ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { SettingsStore } from './settings'
import { validSettingsPatch } from '../shared/settings'

export function installSettingsIpc(window: BrowserWindow): SettingsStore | null {
  let store: SettingsStore | null = null
  try {
    store = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  } catch {
    // Keep exact composition available; load/save will report the storage failure.
  }
  const own = (event: IpcMainInvokeEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  ipcMain.handle('settings:load', (event) => {
    if (!own(event) || !store) throw Error('Could not load settings')
    return store.read()
  })
  ipcMain.handle('settings:save', (event, patch: unknown) => {
    if (!own(event) || !store || !validSettingsPatch(patch)) throw Error('Could not save settings')
    store.save(patch)
  })
  window.on('closed', () => {
    ipcMain.removeHandler('settings:load')
    ipcMain.removeHandler('settings:save')
  })
  return store
}
