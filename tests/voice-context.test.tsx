// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLayoutEffect } from 'react'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { CompositionProvider } from '../src/renderer/src/composition/context'
import { useComposition, useCompositionDispatch } from '../src/renderer/src/composition/state'
import { InteractionProvider } from '../src/renderer/src/interaction/controls'
import { useInteraction } from '../src/renderer/src/interaction/state'
import { useVoice } from '../src/renderer/src/features/voice/useVoice'
import { DEFAULT_VOICE, type VoiceApi, type VoiceEvent } from '../src/shared/voice'
vi.mock('../src/renderer/src/features/voice/audio', () => ({
  captureMicrophone: vi.fn(async () => ({ rate: 48000, close: vi.fn() })),
  SpeechPlayer: vi.fn()
}))
let current: ReturnType<typeof useComposition>,
  dispatch: ReturnType<typeof useCompositionDispatch>,
  interaction: ReturnType<typeof useInteraction>,
  voice: ReturnType<typeof useVoice>
let events: Set<(event: VoiceEvent) => void>, api: VoiceApi
function Harness(): null {
  const composition = useComposition()
  const send = useCompositionDispatch()
  const controls = useInteraction()
  const controller = useVoice()
  useLayoutEffect(() => {
    current = composition
    dispatch = send
    interaction = controls
    voice = controller
  })
  return null
}
function emit(text: string, final = true, session?: string): void {
  const id = session ?? vi.mocked(api.listen).mock.calls.at(-1)![0]
  for (const callback of events)
    callback({ type: 'transcript', session: id, id: `${id}-1`, text, final })
}
beforeEach(() => {
  events = new Set()
  api = {
    status: vi.fn().mockResolvedValue({ configured: true, settings: DEFAULT_VOICE }),
    voices: vi.fn().mockResolvedValue([]),
    saveSettings: vi.fn().mockResolvedValue(undefined),
    listen: vi.fn().mockResolvedValue(undefined),
    audio: vi.fn(),
    endListening: vi.fn(),
    speak: vi.fn(),
    stop: vi.fn(),
    onEvent: (fn) => {
      events.add(fn)
      return () => {
        events.delete(fn)
      }
    }
  }
  window.voice = api
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  })
})
afterEach(() => {
  cleanup()
  delete window.voice
})
async function setup(): Promise<void> {
  render(
    <CompositionProvider>
      <InteractionProvider>
        <Harness />
      </InteractionProvider>
    </CompositionProvider>
  )
  await waitFor(() => expect(api.listen).toHaveBeenCalledOnce())
}
describe('always-on context bridge', () => {
  it('starts automatically, keeps partials out of Gemini and refreshes expansion after finalized speech', async () => {
    await setup()
    act(() => {
      dispatch({ type: 'cloud', enabled: true })
      dispatch({ type: 'example', initials: 'iwac' })
      dispatch({ type: 'predict', purpose: 'expansion', id: 'before' })
    })
    act(() => emit('Would you like coffee', false))
    expect(voice.partial).toBe('Would you like coffee')
    expect(current.conversation).toHaveLength(0)
    act(() => emit('Would you like coffee or tea?'))
    expect(current.conversation.at(-1)?.speaker).toBe('partner')
    expect(current.request?.id).not.toBe('before')
    expect(current.request?.conversation.at(-1)?.text).toBe('Would you like coffee or tea?')
  })
  it('defers context changes during dwell and drops queued and late speech on Clear', async () => {
    await setup()
    const oldSession = vi.mocked(api.listen).mock.calls.at(-1)![0]
    act(() => interaction.setBusy(true))
    act(() => emit('Old private context'))
    expect(current.conversation).toHaveLength(0)
    act(() => dispatch({ type: 'conversation-clear' }))
    await waitFor(() => expect(api.listen).toHaveBeenCalledTimes(2))
    act(() => {
      interaction.setBusy(false)
      emit('late old transcript', true, oldSession)
    })
    expect(current.conversation).toHaveLength(0)
    act(() => emit('New context'))
    expect(current.conversation.at(-1)?.text).toBe('New context')
  })
  it('releases the microphone session on unmount', async () => {
    await setup()
    const id = vi.mocked(api.listen).mock.calls[0][0]
    cleanup()
    expect(api.endListening).toHaveBeenCalledWith(id)
  })
})
