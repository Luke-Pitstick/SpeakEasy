import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  DEFAULT_VOICE,
  type PresetVoice,
  type SpeechRequest,
  type VoiceSettings
} from '../../../../shared/voice'
import { useComposition, useCompositionDispatch } from '../../composition/state'
import { useInteraction } from '../../interaction/state'
import { captureMicrophone, SpeechPlayer } from './audio'

export interface VoiceController {
  settings: VoiceSettings
  update(patch: Partial<VoiceSettings>): void
  configured: boolean
  voices: PresetVoice[]
  devices: { value: string; label: string }[]
  listening: string
  partial: string
  speechStatus: string
  speaking: boolean
  error: string
  speak(text: string, revision: number, origin?: 'speak' | 'preview'): Promise<void>
  stop(): void
}

export function useVoice(): VoiceController {
  const state = useComposition(),
    dispatch = useCompositionDispatch(),
    { busy } = useInteraction()
  const [settings, setSettings] = useState<VoiceSettings>({ ...DEFAULT_VOICE })
  const [configured, setConfigured] = useState(false)
  const [voices, setVoices] = useState<PresetVoice[]>([])
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([
    { value: 'default', label: 'System microphone' }
  ])
  const [listening, setListening] = useState(() =>
    window.voice ? 'Connecting microphone…' : 'Voice is available in the desktop app.'
  )
  const [transcript, setTranscript] = useState({ epoch: state.contextEpoch, text: '' })
  const [error, setError] = useState('')
  const [speechStatus, setSpeechStatus] = useState('Ready')
  const [speaking, setSpeaking] = useState(false)
  const [retry, setRetry] = useState(0)
  const [queueVersion, setQueueVersion] = useState(0)
  const queue = useRef<{ speaker: 'me' | 'partner'; text: string; epoch: number }[]>([])
  const session = useRef('')
  const epoch = useRef(state.contextEpoch)
  useLayoutEffect(() => {
    epoch.current = state.contextEpoch
  }, [state.contextEpoch])
  const setPartial = (text: string): void => setTranscript({ epoch: epoch.current, text })
  const active = useRef<{
    request: SpeechRequest
    player: SpeechPlayer
    started: boolean
    epoch: number
  } | null>(null)
  const playback = useRef<AudioContext | null>(null)
  const captureAbort = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const enqueue = (speaker: 'me' | 'partner', text: string, contextEpoch: number): void => {
    if (!text.trim() || contextEpoch !== epoch.current) return
    // Split long utterances at word boundaries; retain only the bounded recent window.
    let remaining = text.trim()
    while (remaining) {
      let end = Math.min(1000, remaining.length)
      if (end < remaining.length) {
        const space = remaining.lastIndexOf(' ', end)
        if (space > 500) end = space
      }
      queue.current.push({ speaker, text: remaining.slice(0, end), epoch: contextEpoch })
      remaining = remaining.slice(end).trim()
    }
    queue.current = queue.current.slice(-8)
    setQueueVersion((v) => v + 1)
  }
  useEffect(() => {
    if (busy || !state.paused) return
    const turns = queue.current.splice(0)
    for (const turn of turns)
      if (turn.epoch === state.contextEpoch)
        dispatch({ type: 'conversation-add', speaker: turn.speaker, text: turn.text })
  }, [queueVersion, busy, state.paused, state.contextEpoch, dispatch])
  useEffect(() => {
    queue.current = []
  }, [state.contextEpoch])
  const refreshDevices = async (): Promise<void> => {
    const all = await navigator.mediaDevices.enumerateDevices()
    if (mounted.current)
      setDevices([
        { value: 'default', label: 'System microphone' },
        ...all
          .filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default')
          .map((d, i) => ({ value: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
      ])
  }
  useEffect(() => {
    mounted.current = true
    const api = window.voice
    if (!api) return
    void api
      .status()
      .then((result) => {
        if (!mounted.current) return
        setSettings(result.settings)
        setConfigured(result.configured)
        if (!result.configured) setListening('Set CARTESIA_API_KEY in .env and restart SpeakEasy.')
        else
          void api
            .voices()
            .then((v) => {
              if (mounted.current) setVoices(v)
            })
            .catch(() => {
              if (mounted.current)
                setError('Could not load preset voices. Check Cartesia access and reopen the app.')
            })
      })
      .catch(() => {
        if (mounted.current) setListening('Could not connect voice services. Restart SpeakEasy.')
      })
    return () => {
      mounted.current = false
      captureAbort.current?.abort()
      if (active.current) {
        active.current.player.stop()
        api.stop(active.current.request.id)
        active.current = null
      }
      void playback.current?.close().catch(() => {})
      playback.current = null
    }
  }, [])
  useEffect(() => {
    const media = navigator.mediaDevices
    if (!media) return
    const refresh = (): void => {
      void refreshDevices().catch(() => {})
    }
    media.addEventListener('devicechange', refresh)
    return () => media.removeEventListener('devicechange', refresh)
  }, [])
  useEffect(() => {
    const api = window.voice
    if (!api || !configured || speaking) return
    const controller = new AbortController()
    captureAbort.current = controller
    const id = crypto.randomUUID()
    session.current = id
    const contextEpoch = state.contextEpoch
    let reconnect: ReturnType<typeof setTimeout> | undefined
    let failed = false
    const fail = (message: string): void => {
      if (failed || controller.signal.aborted) return
      failed = true
      controller.abort()
      api.endListening(id)
      setPartial('')
      setListening(message)
      reconnect = setTimeout(
        () => setRetry((v) => v + 1),
        Math.min(30000, 1000 * 2 ** Math.min(retry, 5))
      )
    }
    const off = api.onEvent((event) => {
      if (
        controller.signal.aborted ||
        !('session' in event) ||
        event.session !== id ||
        contextEpoch !== epoch.current
      )
        return
      if (event.type === 'listening') {
        if (event.status === 'error') fail(event.message || 'Reconnecting microphone…')
        else
          setListening(
            event.status === 'listening' ? 'Listening to conversation' : 'Connecting to Cartesia…'
          )
      } else if (event.type === 'transcript') {
        if (event.final) {
          setPartial('')
          enqueue('partner', event.text, contextEpoch)
        } else setPartial(event.text)
      }
    })
    void (async () => {
      const microphone = await captureMicrophone(
        settings.microphoneId,
        controller.signal,
        (bytes) => api.audio(id, bytes),
        () => fail('Microphone disconnected. Reconnecting…')
      )
      if (controller.signal.aborted) {
        microphone.close()
        return
      }
      await api.listen(id, microphone.rate)
      if (controller.signal.aborted) {
        api.endListening(id)
        return
      }
      await refreshDevices()
    })().catch((error) => {
      if (controller.signal.aborted) return
      const denied = error instanceof DOMException && error.name === 'NotAllowedError'
      fail(
        denied
          ? 'Microphone permission needed. Allow SpeakEasy in System Settings → Privacy & Security → Microphone.'
          : 'Microphone unavailable. Check the selected input and Cartesia connection; retrying…'
      )
    })
    return () => {
      off()
      controller.abort()
      api.endListening(id)
      if (reconnect) clearTimeout(reconnect)
      if (session.current === id) session.current = ''
    }
  }, [configured, settings.microphoneId, speaking, retry, state.contextEpoch])
  useEffect(
    () =>
      window.voice?.onEvent((event) => {
        const current = active.current
        if (!current || !('id' in event) || event.id !== current.request.id) return
        if (event.type === 'audio') current.player.push(event.samples)
        else if (event.type === 'speech') {
          if (event.status === 'generated') current.player.done()
          else if (event.status === 'failed') {
            current.player.stop()
            active.current = null
            if (current.started && current.request.origin === 'speak')
              enqueue(
                'me',
                `[Playback interrupted; full intended message: ${current.request.text}]`,
                current.epoch
              )
            setSpeaking(false)
            setSpeechStatus('Speech failed')
            setError(event.message || 'Speech failed. Choose Speak to retry.')
          }
        }
      }),
    []
  )
  const speak = async (
    text: string,
    revision: number,
    origin: 'speak' | 'preview' = 'speak'
  ): Promise<void> => {
    const api = window.voice
    if (!api || !configured || active.current) return
    if (!text.trim()) return
    if (/[<>]/.test(text)) {
      setError(
        'Angle-bracket markup cannot be spoken literally by this provider. Edit those symbols before speaking.'
      )
      return
    }
    captureAbort.current?.abort()
    if (session.current) api.endListening(session.current)
    setPartial('')
    setSpeaking(true)
    setSpeechStatus('Preparing speech…')
    setError('')
    setListening('Listening resumes after speech')
    const request: SpeechRequest = {
      id: crypto.randomUUID(),
      revision,
      text,
      origin,
      settings: { ...settings }
    }
    const context = playback.current ?? new AudioContext()
    playback.current = context
    const player = new SpeechPlayer(
      context,
      settings.volume,
      () => {
        if (active.current?.request.id === request.id) {
          active.current.started = true
          setSpeechStatus('Speaking')
        }
      },
      () => {
        const current = active.current
        if (current?.request.id !== request.id) return
        active.current = null
        if (origin === 'speak' && current.started) {
          // A locked sentence already entered the session before playback.
          const alreadyCommitted = state.conversation.some(
            (turn) => turn.id === state.savedSentences.at(-1) && turn.text === text.trim()
          )
          if (!alreadyCommitted) enqueue('me', text, current.epoch)
          dispatch({ type: 'speech-completed', text, revision })
        }
        setSpeechStatus('Finished')
        setTimeout(() => {
          if (mounted.current && !active.current) setSpeaking(false)
        }, 300)
      }
    )
    active.current = { request, player, started: false, epoch: epoch.current }
    try {
      await context.resume()
      if (active.current?.request.id === request.id) await api.speak(request)
    } catch {
      if (active.current?.request.id === request.id) {
        player.stop()
        active.current = null
        setSpeaking(false)
        setSpeechStatus('Speech failed')
        setError('Could not start speech. Check Cartesia configuration and try Speak again.')
      }
    }
  }
  const stop = (): void => {
    const current = active.current
    if (!current) return
    active.current = null
    current.player.stop()
    window.voice?.stop(current.request.id)
    if (current.started && current.request.origin === 'speak')
      enqueue(
        'me',
        `[Playback interrupted; full intended message: ${current.request.text}]`,
        current.epoch
      )
    setSpeechStatus('Stopped')
    setTimeout(() => {
      if (mounted.current && !active.current) setSpeaking(false)
    }, 300)
  }
  const update = (patch: Partial<VoiceSettings>): void => {
    const next = { ...settings, ...patch }
    setSettings(next)
    void window.voice
      ?.saveSettings(next)
      .catch(() => setError('Voice settings could not be saved. They will reset after restart.'))
  }
  return {
    settings,
    update,
    configured,
    voices,
    devices,
    listening,
    partial: transcript.epoch === state.contextEpoch ? transcript.text : '',
    speechStatus,
    speaking,
    error,
    speak,
    stop
  }
}
