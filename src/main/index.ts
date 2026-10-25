import { app, BrowserWindow, session, systemPreferences } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { installDiagnosticsIpc } from './diagnosticsIpc'
import { installGeminiIpc } from './geminiIpc'
import { installCartesiaIpc } from './cartesiaIpc'
import { installJevIpc } from './jevIpc'
import { installSettingsIpc } from './settingsIpc'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 940,
    minWidth: 1024,
    minHeight: 810,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  installDiagnosticsIpc(mainWindow)
  const settings = installSettingsIpc(mainWindow)
  installGeminiIpc(mainWindow, settings)
  installCartesiaIpc(mainWindow)
  installJevIpc(mainWindow, settings)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.speakeasy.app')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Camera and microphone are available only to this app's top-level renderer.
  const ownContents = (contents: Electron.WebContents | null): boolean =>
    !!contents &&
    !contents.getURL().endsWith('#debug') &&
    BrowserWindow.getAllWindows().some((window) => window.webContents === contents)
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const mediaTypes = 'mediaTypes' in details ? (details.mediaTypes ?? []) : []
    callback(
      ownContents(contents) &&
        details.isMainFrame &&
        permission === 'media' &&
        mediaTypes.every((type) => type === 'video' || type === 'audio')
    )
  })
  session.defaultSession.setPermissionCheckHandler(
    (contents, permission) => ownContents(contents) && permission === 'media'
  )
  if (process.platform === 'darwin') {
    systemPreferences.askForMediaAccess('camera')
  }

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
