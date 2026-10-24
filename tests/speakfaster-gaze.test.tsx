// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { installGeminiMock } from './prediction-fixture'
import App from '../src/renderer/src/App'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'
import { INITIAL_ALPHABET, LITERAL_ALPHABET } from '../src/renderer/src/features/dasher/prediction'

const speak = vi.hoisted(() => vi.fn())
vi.mock('../src/renderer/src/features/voice/useVoice', () => ({
  useVoice: () => ({
    configured: true,
    settings: { voiceId: 'test-voice', speed: 1, tone: 'neutral' },
    speaking: false,
    listening: 'Test voice',
    speechStatus: 'Idle',
    speak,
    stop: vi.fn()
  })
}))

// Synthetic gaze: real dwell controls, real Dasher frame loop and engine, real
// reducer and asynchronous demo provider. No clicks, key events or input changes.
function gazeWorkspace(): {
  dwell: (name: string | RegExp) => void
  spell: (text: string, literal?: boolean) => void
  review: () => Promise<void>
} {
  installGeminiMock()
  vi.useFakeTimers()
  vi.stubGlobal('PointerEvent', MouseEvent)
  const frames = new Map<number, FrameRequestCallback>()
  let frameId = 0
  vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => {
    frames.set(++frameId, frame)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        /* Fixed viewport for synthetic gaze. */
      }
      disconnect(): void {
        /* No native observer was registered. */
      }
    }
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 1100,
    height: 330,
    right: 1100,
    bottom: 330,
    toJSON: () => ({})
  })
  const active: { engine: DasherEngine | null } = { engine: null }
  const resume = DasherEngine.prototype.resume
  vi.spyOn(DasherEngine.prototype, 'resume').mockImplementation(function (this: DasherEngine) {
    active.engine = this
    return resume.call(this)
  })
  render(<App />)
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(screen.queryByRole('navigation', { name: 'Composition workspace' })).toBeNull()
  let now = performance.now()
  const dwell = (name: string | RegExp): void => {
    const target = screen.getByRole('button', { name, exact: typeof name === 'string' })
    fireEvent.pointerEnter(target)
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.pointerLeave(target)
  }
  expect(screen.queryByRole('region', { name: 'SpeakFaster phrase composition' })).toBeNull()
  expect(screen.getByLabelText('Message preview').textContent).toBe('Your message')
  expect(screen.getByRole('button', { name: 'Start writing' }).hasAttribute('disabled')).toBe(false)
  expect(screen.getByRole('button', { name: 'Resume Dasher' })).toBeTruthy()
  return {
    dwell,
    spell(text, literal = false) {
      // Writing resumes by itself on returning from phrases, so Start writing may not be shown.
      if (screen.queryByRole('button', { name: 'Start writing' })) dwell('Start writing')
      const surface = screen.getByTestId('dasher-surface')
      fireEvent.pointerEnter(surface, { clientX: 550, clientY: 165 })
      const alphabet = literal ? LITERAL_ALPHABET : INITIAL_ALPHABET
      for (let frame = 0; frame < 12000; frame++) {
        const engine = active.engine
        if (!engine) throw new Error('Dwell Start writing did not resume Dasher')
        if (engine.text === text) return
        const prefix = engine.root.text
        const character = text[prefix.length]
        const target = engine.regions().find((region) => region.text === prefix + character)
        let x: number
        let y = 0
        if (!text.startsWith(prefix)) x = -engine.geometry.width * 0.4
        else {
          // Zoom toward the true interval even before a tiny letter is drawn.
          const index = alphabet.indexOf(character)
          const center = target
            ? target.top + target.height / 2
            : engine.root.top +
              engine.root.height *
                (engine.root.fractions
                  .slice(0, index)
                  .reduce((sum, fraction) => sum + fraction, 0) +
                  engine.root.fractions[index] / 2)
          y = Math.max(engine.geometry.top + 8, Math.min(engine.geometry.bottom - 8, center))
          x =
            center < engine.geometry.top + 8 || center > engine.geometry.bottom - 8
              ? 0
              : engine.geometry.width * 0.1
        }
        fireEvent.pointerMove(surface, { clientX: 550 + x, clientY: 165 + y })
        now += 16.67
        act(() => {
          const pending = [...frames.values()]
          frames.clear()
          pending.forEach((callback) => callback(now))
        })
      }
      throw new Error(
        `Synthetic gaze could not spell ${text}; engine=${active.engine?.text}; root=${active.engine?.root.text}; pause=${!!screen.queryByRole('button', { name: 'Start writing' })}; frames=${frames.size}`
      )
    },
    async review() {
      // Moving up onto the switch: a real leave names the element entered. (A leave with no
      // element entered means the pointer left the window, which keeps steering.)
      fireEvent.pointerLeave(screen.getByTestId('dasher-surface'), {
        relatedTarget: screen.getByRole('button', { name: /Show phrases/ })
      })
      dwell('Show phrases')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
    }
  }
}

afterEach(() => {
  cleanup()
  speak.mockClear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('enters initials, rejects, spells a prefix, and edits an unaccepted phrase through gaze alone', async () => {
  const gaze = gazeWorkspace()
  const start = vi.spyOn(window.gemini!, 'start')
  gaze.spell('iwac')
  await gaze.review()
  expect(start).toHaveBeenCalledOnce()
  expect(start.mock.calls[0][0].purpose).toBe('expansion')
  expect(screen.getByText('I want a coffee')).toBeTruthy()
  gaze.dwell('None of these')
  gaze.dwell('Word 4 c Initial')
  gaze.spell('co', true)
  await gaze.review()
  expect(start.mock.calls.at(-1)?.[0]).toMatchObject({
    purpose: 'expansion',
    tokens: [{ value: 'i' }, { value: 'w' }, { value: 'a' }, { kind: 'prefix', value: 'co' }]
  })
  expect(screen.queryByText('I want another cushion')).toBeNull()
  expect(screen.getByText('I want a coffee')).toBeTruthy()
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: Your message'
  )
  gaze.dwell('I want a coffee')
  gaze.dwell('Word 4 coffee Change word')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(screen.getByRole('button', { name: 'cocoa', exact: true })).toBeTruthy()
  gaze.dwell('cocoa')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: Your message'
  )
  gaze.dwell('Use phrase')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a cocoa'
  )
  expect(speak).not.toHaveBeenCalled()
  gaze.dwell('Speak')
  expect(speak).toHaveBeenCalledExactlyOnceWith('I want a cocoa', expect.any(Number))
}, 30000)

it('spells an uncommon replacement, cancels, retries, accepts and undoes using only gaze', async () => {
  const gaze = gazeWorkspace()
  gaze.spell('iwac')
  await gaze.review()
  gaze.dwell('I want a coffee')
  gaze.dwell('Use phrase')
  gaze.dwell('Edit message')
  gaze.dwell('Word 4 coffee Change word')
  gaze.dwell('Spell word')
  gaze.spell('Zephyr', true)
  await gaze.review()
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a coffee'
  )
  gaze.dwell('Cancel word')
  expect(screen.getByRole('button', { name: 'Word 4 coffee Change word' })).toBeTruthy()
  gaze.dwell('Word 4 coffee Change word')
  gaze.dwell('Spell word')
  gaze.spell('Zephyr', true)
  await gaze.review()
  gaze.dwell('Use word')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a coffee'
  )
  gaze.dwell('Use phrase')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a Zephyr'
  )
  gaze.dwell('Menu')
  gaze.dwell('Undo')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a coffee'
  )
}, 30000)

it('reaches later word positions and spells a keyword after an empty expansion', async () => {
  const gaze = gazeWorkspace()
  gaze.spell('abcdefg')
  await gaze.review()
  expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  gaze.dwell('None of these')
  expect(screen.queryByRole('button', { name: 'Word 7 g Initial' })).toBeNull()
  gaze.dwell('Next words')
  gaze.dwell('Word 7 g Initial')
  gaze.spell('George', true)
  await gaze.review()
  gaze.dwell('Lock word')
  gaze.dwell('Next words')
  expect(screen.getByRole('button', { name: 'Word 7 George Locked word' })).toBeTruthy()
  gaze.dwell('Previous words')
  expect(screen.getByRole('button', { name: 'Word 1 a Initial' })).toBeTruthy()
  gaze.dwell('Keep entering')
  expect(screen.getByLabelText('Message preview').textContent).toBe('abcdef{George}')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: Your message'
  )
}, 30000)

it('switches explicitly, preserves the draft and initials, and resumes writing on return', async () => {
  const gaze = gazeWorkspace()
  expect(screen.queryByRole('region', { name: 'SpeakFaster phrase composition' })).toBeNull()
  gaze.spell('iwac')
  fireEvent.pointerLeave(screen.getByTestId('dasher-surface'), {
    relatedTarget: screen.getByRole('button', { name: /Show phrases/ })
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(screen.queryByRole('region', { name: 'SpeakFaster phrase composition' })).toBeNull()
  gaze.dwell('Show phrases')
  expect(screen.queryByRole('button', { name: 'Resume Dasher' })).toBeNull()
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: Your message'
  )
  gaze.dwell('Keep writing')
  expect(screen.getByLabelText('Message preview').textContent).toBe('iwac')
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  // Resuming starts a new entry session, which invalidates the earlier suggestions; switching
  // again requests fresh ones, so wait for them.
  await gaze.review()
  gaze.dwell('I want a coffee')
  gaze.dwell('Use phrase')
  gaze.dwell('Lock sentence & keep writing')
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: I want a coffee'
  )
  gaze.dwell('Menu')
  gaze.dwell('New message')
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  expect(screen.getByLabelText('Message preview').getAttribute('aria-description')).toBe(
    'Accepted message: Your message'
  )
}, 30000)

it('locks a sentence, spells fresh initials, and speaks the assembled message', async () => {
  const gaze = gazeWorkspace()
  const start = vi.spyOn(window.gemini!, 'start')
  gaze.spell('iwac')
  await gaze.review()
  gaze.dwell('I want a coffee')
  gaze.dwell('Lock sentence & keep writing')
  expect(screen.getByLabelText('Message preview').textContent).toBe('Your message')
  expect(speak).not.toHaveBeenCalled()
  gaze.spell('iwac')
  expect(screen.getByLabelText('Message preview').textContent).toBe('iwac')
  await gaze.review()
  expect(start.mock.calls.at(-1)?.[0].lockedMessage).toBe('I want a coffee')
  gaze.dwell('I want a coffee')
  gaze.dwell('Speak')
  expect(speak).toHaveBeenCalledExactlyOnceWith(
    'I want a coffee I want a coffee',
    expect.any(Number)
  )
}, 30000)
