import type { DiagnosticsApi } from '../shared/diagnostics'
import { contextBridge, ipcRenderer } from 'electron'
import type { VoiceApi, VoiceEvent } from '../shared/voice'
import type { GeminiApi, PredictionResult } from '../shared/prediction'
import type { SettingsApi } from '../shared/settings'
import type { MemoryApi } from '../shared/memory'
import type { PreferenceApi } from '../shared/preferences'
const preferences: PreferenceApi = {
  read: () => ipcRenderer.invoke('preferences:read'),
  update: (operation) => ipcRenderer.invoke('preferences:update', operation),
  onChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, invalidate: boolean): void =>
      listener(invalidate)
    ipcRenderer.on('preferences:changed', receive)
    return () => {
      ipcRenderer.removeListener('preferences:changed', receive)
    }
  }
}
contextBridge.exposeInMainWorld('preferences', preferences)
const memory: MemoryApi = {
  read: () => ipcRenderer.invoke('memory:read'),
  update: (operation) => ipcRenderer.invoke('memory:update', operation),
  onChanged: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, invalidate: boolean): void =>
      listener(invalidate)
    ipcRenderer.on('memory:changed', receive)
    return () => {
      ipcRenderer.removeListener('memory:changed', receive)
    }
  }
}
contextBridge.exposeInMainWorld('memory', memory)
const settings: SettingsApi = {
  load: () => ipcRenderer.invoke('settings:load'),
  save: (patch) => ipcRenderer.invoke('settings:save', patch)
}
contextBridge.exposeInMainWorld('settings', settings)
const gemini: GeminiApi = {
  syncContext: (turns) => ipcRenderer.invoke('gemini:context', turns),
  models: () => ipcRenderer.invoke('gemini:models'),
  setModel: (model) => ipcRenderer.invoke('gemini:model', model),
  clearPhraseCache: () => ipcRenderer.invoke('gemini:clear-cache'),
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

const diagnostics: DiagnosticsApi = {
  open: (context) => ipcRenderer.invoke('diagnostics:open', context),
  context: (context) => ipcRenderer.send('diagnostics:context', context),
  read: () => ipcRenderer.invoke('diagnostics:read'),
  clear: () => ipcRenderer.invoke('diagnostics:clear')
}
contextBridge.exposeInMainWorld('diagnostics', diagnostics)
