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
import { installGeminiMock } from './prediction-fixture'
vi.mock('../src/renderer/src/features/voice/audio', () => ({
  captureMicrophone: vi.fn(async () => ({ rate: 48000, close: vi.fn() })),
  SpeechPlayer: vi.fn(function (_context, _volume, started: () => void, done: () => void) {
    return { push: started, done, stop: vi.fn() }
  })
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
  vi.stubGlobal(
    'AudioContext',
    class {
      resume = vi.fn().mockResolvedValue(undefined)
      close = vi.fn().mockResolvedValue(undefined)
    }
  )
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
  installGeminiMock()
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
  delete window.gemini
  vi.unstubAllGlobals()
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
  it.each(['completed', 'stopped', 'failed', 'preview'] as const)(
    'clears initials only after successful spoken playback: %s',
    async (outcome) => {
      await setup()
      act(() => {
        dispatch({ type: 'example', initials: 'iwac' })
        dispatch({ type: 'mode', mode: 'literal' })
        dispatch({ type: 'input', text: 'I want a coffee' })
      })
      await act(async () => {
        await voice.speak(
          current.draft,
          current.revision,
          outcome === 'preview' ? 'preview' : 'speak'
        )
      })
      expect(current.tokens).toHaveLength(4)
      const id = vi.mocked(api.speak).mock.calls.at(-1)![0].id
      act(() => {
        for (const callback of events) callback({ type: 'audio', id, samples: new Uint8Array(4) })
      })
      expect(current.tokens).toHaveLength(4)
      act(() => {
        if (outcome === 'stopped') voice.stop()
        else
          for (const callback of events)
            callback({ type: 'speech', id, status: outcome === 'failed' ? 'failed' : 'generated' })
      })
      expect(current.tokens).toHaveLength(outcome === 'completed' ? 0 : 4)
      expect(current.draft).toBe(outcome === 'completed' ? '' : 'I want a coffee')
      if (outcome === 'completed') expect(current.conversation.at(-1)?.text).toBe('I want a coffee')
      expect(current.mode).toBe(outcome === 'completed' ? 'initials' : 'literal')
      expect(current.sentenceEvents).toEqual([])
    }
  )
  it('summarizes only with Gemini enabled and ignores a late result after clearing conversation', async () => {
    await setup()
    let resolveSummary: (text: string) => void = () => {}
    const summarize = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveSummary = resolve
        })
    )
    const cancelSummary = vi.fn()
    window.gemini!.summarize = summarize
    window.gemini!.cancelSummary = cancelSummary
    act(() => {
      for (let i = 0; i < 9; i++)
        dispatch({
          type: 'conversation-add',
          speaker: 'partner',
          text: i === 0 ? 'Clash Royale' : 'Go on.'
        })
    })
    expect(summarize).not.toHaveBeenCalled()
    act(() => dispatch({ type: 'cloud', enabled: true }))
    await waitFor(() => expect(summarize).toHaveBeenCalledOnce())
    act(() => dispatch({ type: 'conversation-clear' }))
    expect(cancelSummary).toHaveBeenCalledOnce()
    await act(async () => {
      resolveSummary('Clash Royale')
      await Promise.resolve()
    })
    expect(current.conversationSummary).toBe('')
    expect(current.summaryPending).toEqual([])
  })
  it('retains a locked sentence after speech without duplicating it', async () => {
    await setup()
    act(() => {
      dispatch({ type: 'mode', mode: 'literal' })
      dispatch({ type: 'input', text: 'My favorite deck is Hog Cycle' })
      dispatch({ type: 'lock-sentence' })
    })
    expect(current.conversation).toHaveLength(1)
    await act(async () => {
      await voice.speak(current.draft, current.revision, 'speak')
    })
    const id = vi.mocked(api.speak).mock.calls.at(-1)![0].id
    act(() => {
      for (const callback of events) {
        callback({ type: 'audio', id, samples: new Uint8Array(4) })
        callback({ type: 'speech', id, status: 'generated' })
      }
    })
    act(() => dispatch({ type: 'clear' }))
    expect(current.conversation).toHaveLength(1)
    expect(current.conversation[0].text).toBe('My favorite deck is Hog Cycle')
  })
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
  it('includes a question finalized while writing in the next expansion and keeps the follow-up', async () => {
    await setup()
    act(() => {
      dispatch({ type: 'cloud', enabled: true })
      dispatch({ type: 'example', initials: 'idlm' })
      dispatch({ type: 'resume' })
    })
    act(() => emit('What was your least favorite subject when you were in school?'))
    expect(voice.queuedTranscripts).toHaveLength(1)
    expect(current.conversation).toHaveLength(0)
    act(() => dispatch({ type: 'predict', purpose: 'expansion', id: 'school' }))
    expect(current.request?.conversation.at(-1)?.text).toContain('when you were in school')
    act(() => {
      dispatch({ type: 'conversation-add', speaker: 'me', text: "I didn't like math." })
      dispatch({ type: 'example', initials: 'ittitc' })
      interaction.setBusy(true)
    })
    act(() => emit("What's wrong with math? It's not that hard."))
    expect(current.conversation).toHaveLength(2)
    act(() => interaction.setBusy(false))
    act(() => dispatch({ type: 'predict', purpose: 'expansion', id: 'math-follow-up' }))
    expect(current.request?.conversation.map((t) => t.text)).toEqual([
      'What was your least favorite subject when you were in school?',
      "I didn't like math.",
      "What's wrong with math? It's not that hard."
    ])
  })
  it('releases the microphone session on unmount', async () => {
    await setup()
    const id = vi.mocked(api.listen).mock.calls[0][0]
    cleanup()
    expect(api.endListening).toHaveBeenCalledWith(id)
  })
})
