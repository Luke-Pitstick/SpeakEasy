import { contextBridge, ipcRenderer } from 'electron'
import type { VoiceApi, VoiceEvent } from '../shared/voice'
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

const voice: VoiceApi = {
  status: () => ipcRenderer.invoke('voice:status'),
  voices: () => ipcRenderer.invoke('voice:voices'),
  saveSettings: (settings) => ipcRenderer.invoke('voice:settings', settings),
  listen: (id, rate) => ipcRenderer.invoke('voice:listen', id, rate),
  audio: (id, samples) => ipcRenderer.send('voice:audio', id, samples),
  endListening: (id) => ipcRenderer.send('voice:end-listening', id),
  speak: (request) => ipcRenderer.invoke('voice:speak', request),
  stop: (id) => ipcRenderer.send('voice:stop', id),
  onEvent: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, event: VoiceEvent): void => listener(event)
    ipcRenderer.on('voice:event', receive)
    return () => {
      ipcRenderer.removeListener('voice:event', receive)
    }
  }
}
contextBridge.exposeInMainWorld('voice', voice)
