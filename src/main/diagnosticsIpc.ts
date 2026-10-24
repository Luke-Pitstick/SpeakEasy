import { BrowserWindow, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'
import { debugContextSchema } from '../shared/diagnostics'
import { diagnostics } from './diagnosticStore'

export function installDiagnosticsIpc(owner: BrowserWindow): void {
  let inspector: BrowserWindow | null = null
  const owns = (event: IpcMainEvent | IpcMainInvokeEvent, window: BrowserWindow | null): boolean =>
    !!window &&
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  ipcMain.handle('diagnostics:open', async (event, value: unknown) => {
    if (!owns(event, owner)) throw Error('Unauthorized sender')
    const context = debugContextSchema.parse(value)
    diagnostics.start(context)
    if (inspector && !inspector.isDestroyed()) {
      inspector.show()
      inspector.focus()
      return
    }
    inspector = new BrowserWindow({
      title: 'SpeakEasy — Conversation debug',
      width: 1100,
      height: 850,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    const window = inspector
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.on('closed', () => {
      inspector = null
      diagnostics.stop()
    })
    if (is.dev && process.env.ELECTRON_RENDERER_URL)
      await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}#debug`)
    else await window.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'debug' })
  })
  const context = (event: IpcMainEvent, value: unknown): void => {
    if (!owns(event, owner)) return
    const parsed = debugContextSchema.safeParse(value)
    if (parsed.success) diagnostics.context(parsed.data)
  }
  ipcMain.on('diagnostics:context', context)
  ipcMain.handle('diagnostics:read', (event) => {
    if (!owns(event, inspector)) throw Error('Unauthorized sender')
    return diagnostics.read()
  })
  ipcMain.handle('diagnostics:clear', (event) => {
    if (!owns(event, inspector) && !owns(event, owner)) throw Error('Unauthorized sender')
    diagnostics.clear()
  })
  owner.on('closed', () => {
    inspector?.destroy()
    diagnostics.stop()
    for (const name of ['open', 'read', 'clear']) ipcMain.removeHandler(`diagnostics:${name}`)
    ipcMain.removeListener('diagnostics:context', context)
  })
}
