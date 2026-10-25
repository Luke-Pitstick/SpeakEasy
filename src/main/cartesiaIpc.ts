import { diagnostics } from './diagnosticStore'
import {
  app,
  ipcMain,
  systemPreferences,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent
} from 'electron'
import { readFileSync } from 'node:fs'
import { writeFile, mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { createCartesia, streamSpeech } from './cartesia'
import {
  DEFAULT_VOICE,
  STT_MODEL,
  validSpeechRequest,
  validVoiceSettings,
  type VoiceEvent
} from '../shared/voice'

export function installCartesiaIpc(window: BrowserWindow): void {
  let key = process.env.CARTESIA_API_KEY ?? ''
  if (!key) {
    try {
      key = parseEnv(readFileSync(join(app.getAppPath(), '.env'), 'utf8')).CARTESIA_API_KEY ?? ''
    } catch {
      /* status reports missing configuration */
    }
  }
  const client = key ? createCartesia(key) : null
  const settingsPath = join(app.getPath('userData'), 'voice-settings.json')
  let settings = { ...DEFAULT_VOICE }
  try {
    const saved: unknown = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (validVoiceSettings(saved)) settings = saved
  } catch {
    /* first launch */
  }
  let saves = Promise.resolve()
  let speech: { id: string; controller: AbortController } | null = null
  let listening: {
    id: string
    socket: ReturnType<NonNullable<typeof client>['stt']['autoFinalize']['websocket']>
    ready: boolean
  } | null = null
  let listenGeneration = 0
  let requestedListeningId = ''
  const own = (event: IpcMainEvent | IpcMainInvokeEvent): boolean =>
    !window.isDestroyed() &&
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame.url === window.webContents.getURL()
  const emit = (event: VoiceEvent): void => {
    if (event.type === 'transcript' || event.type === 'listening')
      diagnostics.record(event.type, event)
    if (!window.isDestroyed()) window.webContents.send('voice:event', event)
  }
  const stopSpeech = (): void => {
    speech?.controller.abort()
    speech = null
  }
  const stopListening = (): void => {
    ++listenGeneration
    requestedListeningId = ''
    const old = listening
    listening = null
    old?.socket.close()
  }
  ipcMain.handle('voice:status', (event) => {
    if (!own(event)) throw Error('Unauthorized sender')
    return { configured: !!client, settings }
  })
  ipcMain.handle('voice:settings', async (event, value: unknown) => {
    if (!own(event) || !validVoiceSettings(value)) throw Error('Invalid voice settings')
    const next = { ...value }
    saves = saves
      .catch(() => {})
      .then(async () => {
        await mkdir(app.getPath('userData'), { recursive: true })
        await writeFile(settingsPath + '.tmp', JSON.stringify(next), { mode: 0o600 })
        await rename(settingsPath + '.tmp', settingsPath)
        settings = next
      })
    await saves
  })
  ipcMain.handle('voice:voices', async (event) => {
    if (!own(event) || !client) throw Error('Cartesia is not configured')
    try {
      const voices: { id: string; name: string; language: string; description: string }[] = []
      for (const is_owner of [true, false]) {
        for await (const v of client.voices.list({ limit: 100, is_owner })) {
          if (v.language === 'en' && !voices.some((voice) => voice.id === v.id))
            voices.push({
              id: v.id,
              name: v.name,
              language: v.language,
              description: v.description
            })
          if (voices.length >= 200) break
        }
        if (voices.length >= 200) break
      }
      return voices
    } catch {
      throw Error('Could not load Cartesia voices. Check the API key and network.')
    }
  })
  ipcMain.handle('voice:listen', async (event, id: unknown, rate: unknown) => {
    if (
      !own(event) ||
      typeof id !== 'string' ||
      !/^[\w-]{1,100}$/.test(id) ||
      typeof rate !== 'number' ||
      !Number.isInteger(rate) ||
      rate < 8000 ||
      rate > 96000 ||
      !client
    )
      throw Error('Invalid microphone session or missing Cartesia key')
    stopListening()
    requestedListeningId = id
    const generation = listenGeneration
    if (process.platform === 'darwin' && !(await systemPreferences.askForMediaAccess('microphone')))
      throw Error('Allow microphone access in macOS System Settings, then restart SpeakEasy.')
    if (generation !== listenGeneration || window.isDestroyed()) return
    const socket = client.stt.autoFinalize.websocket(
      { model: STT_MODEL, encoding: 'pcm_f32le', sample_rate: rate, turn_end_timeout_ms: 1200 },
      { maxQueueSize: rate * 4 }
    )
    const session = { id, socket, ready: false }
    listening = session
    let turn = 0
    const current = (): boolean => listening === session
    emit({ type: 'listening', session: id, status: 'connecting' })
    const timer = setTimeout(() => {
      if (current() && !session.ready) {
        emit({
          type: 'listening',
          session: id,
          status: 'error',
          message: 'Cartesia connection timed out. Reconnecting…'
        })
        stopListening()
      }
    }, 15000)
    socket.on('connected', () => {
      clearTimeout(timer)
      if (current()) {
        session.ready = true
        emit({ type: 'listening', session: id, status: 'listening' })
      }
    })
    socket.on('turn.update', (e) => {
      if (current())
        emit({
          type: 'transcript',
          session: id,
          id: `${id}-${turn}`,
          text: e.transcript.slice(0, 8000),
          final: false
        })
    })
    socket.on('turn.end', (e) => {
      if (current())
        emit({
          type: 'transcript',
          session: id,
          id: `${id}-${turn++}`,
          text: e.transcript.slice(0, 8000),
          final: true
        })
    })
    socket.on('error', () => {
      clearTimeout(timer)
      if (current()) {
        emit({
          type: 'listening',
          session: id,
          status: 'error',
          message: 'Transcription unavailable. Check Cartesia access and your connection; retrying…'
        })
        stopListening()
      }
    })
    socket.on('close', () => {
      clearTimeout(timer)
      if (current()) {
        listening = null
        emit({
          type: 'listening',
          session: id,
          status: 'error',
          message: 'Transcription disconnected. Reconnecting…'
        })
      }
    })
  })
  const onAudio = (event: IpcMainEvent, id: unknown, bytes: unknown): void => {
    const current = listening
    if (
      !own(event) ||
      !current ||
      current.id !== id ||
      !current.ready ||
      !(bytes instanceof ArrayBuffer) ||
      bytes.byteLength > 38400 ||
      bytes.byteLength % 4
    )
      return
    try {
      current.socket.sendRaw(new Uint8Array(bytes))
    } catch {
      emit({
        type: 'listening',
        session: current.id,
        status: 'error',
        message: 'Audio connection interrupted. Reconnecting…'
      })
      stopListening()
    }
  }
  const onEnd = (event: IpcMainEvent, id: unknown): void => {
    if (own(event) && requestedListeningId === id) stopListening()
  }
  ipcMain.on('voice:audio', onAudio)
  ipcMain.on('voice:end-listening', onEnd)
  ipcMain.handle('voice:speak', (event, request: unknown) => {
    if (!own(event) || !validSpeechRequest(request))
      throw Error(
        'Speech needs confirmed plain text and valid voice settings. Angle-bracket control markup is not supported.'
      )
    if (!client) throw Error('Set CARTESIA_API_KEY in .env and restart SpeakEasy.')
    if (speech) throw Error('Stop the current utterance before speaking again.')
    const controller = new AbortController()
    speech = { id: request.id, controller }
    emit({ type: 'speech', id: request.id, status: 'generating' })
    const current = (): boolean => speech?.controller === controller && !controller.signal.aborted
    void streamSpeech(client, request, controller.signal, (samples) => {
      if (current()) emit({ type: 'audio', id: request.id, samples })
    })
      .then(() => {
        if (current()) emit({ type: 'speech', id: request.id, status: 'generated' })
      })
      .catch(() => {
        if (current())
          emit({
            type: 'speech',
            id: request.id,
            status: 'failed',
            message:
              'Speech failed. Check Cartesia access and your connection, then choose Speak to retry.'
          })
      })
      .finally(() => {
        if (speech?.controller === controller) speech = null
      })
  })
  const onStop = (event: IpcMainEvent, id: unknown): void => {
    if (own(event) && speech?.id === id) stopSpeech()
  }
  ipcMain.on('voice:stop', onStop)
  const cleanup = (): void => {
    stopSpeech()
    stopListening()
  }
  window.webContents.on('did-start-navigation', cleanup)
  window.webContents.on('render-process-gone', cleanup)
  window.on('closed', () => {
    cleanup()
    for (const name of ['status', 'settings', 'voices', 'listen', 'speak'])
      ipcMain.removeHandler(`voice:${name}`)
    ipcMain.removeListener('voice:audio', onAudio)
    ipcMain.removeListener('voice:end-listening', onEnd)
    ipcMain.removeListener('voice:stop', onStop)
  })
}
