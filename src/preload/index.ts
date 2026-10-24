import { contextBridge, ipcRenderer } from 'electron'
import type { GeminiApi, PredictionResult } from '../shared/prediction'
const gemini: GeminiApi = {
  status: () => ipcRenderer.invoke('gemini:status'),
  setEnabled: (enabled) => ipcRenderer.invoke('gemini:enabled', enabled),
  start: (request) => ipcRenderer.invoke('gemini:start', request),
  cancel: (id) => ipcRenderer.send('gemini:cancel', id),
  onResult: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, result: PredictionResult): void =>
      listener(result)
    ipcRenderer.on('gemini:result', receive)
    return () => {
      ipcRenderer.removeListener('gemini:result', receive)
    }
  }
}
contextBridge.exposeInMainWorld('gemini', gemini)
