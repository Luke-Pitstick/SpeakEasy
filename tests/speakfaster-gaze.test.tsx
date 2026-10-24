// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '../src/renderer/src/App'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'
import { INITIAL_ALPHABET, LITERAL_ALPHABET } from '../src/renderer/src/features/dasher/prediction'

// Synthetic gaze: real dwell controls, real Dasher frame loop and engine, real
// reducer and asynchronous demo provider. No clicks, key events or input changes.
function gazeWorkspace(): {
  dwell: (name: string | RegExp) => void
  spell: (text: string, literal?: boolean) => void
  review: () => Promise<void>
} {
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
  let now = performance.now()
  const dwell = (name: string | RegExp): void => {
    const target = screen.getByRole('button', { name, exact: typeof name === 'string' })
    fireEvent.pointerEnter(target)
    act(() => vi.advanceTimersByTime(1000))
    fireEvent.pointerLeave(target)
  }
  return {
    dwell,
    spell(text, literal = false) {
      dwell('Start writing')
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
      fireEvent.pointerLeave(screen.getByTestId('dasher-surface'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
    }
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('enters initials, rejects, spells a prefix, and edits an unaccepted phrase through gaze alone', async () => {
  const gaze = gazeWorkspace()
  gaze.spell('iwac')
  await gaze.review()
  expect(screen.getByText('I want a coffee')).toBeTruthy()
  gaze.dwell('None of these')
  gaze.dwell('Word 4 c Initial')
  gaze.spell('co', true)
  await gaze.review()
  expect(screen.queryByText('I want another cushion')).toBeNull()
  expect(screen.getByText('I want a coffee')).toBeTruthy()
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('Your message')
  gaze.dwell('Edit 1')
  gaze.dwell('Word 4 coffee Change word')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(screen.getByRole('button', { name: 'cocoa', exact: true })).toBeTruthy()
  gaze.dwell('cocoa')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('Your message')
  gaze.dwell('Use phrase')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a cocoa')
}, 30000)

it('spells an uncommon replacement, cancels, retries, accepts and undoes using only gaze', async () => {
  const gaze = gazeWorkspace()
  gaze.spell('iwac')
  await gaze.review()
  gaze.dwell('Use 1')
  gaze.dwell('Edit message')
  gaze.dwell('Word 4 coffee Change word')
  gaze.dwell('Spell word')
  gaze.spell('Zephyr', true)
  await gaze.review()
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a coffee')
  gaze.dwell('Cancel word')
  expect(screen.getByRole('button', { name: 'Word 4 coffee Change word' })).toBeTruthy()
  gaze.dwell('Word 4 coffee Change word')
  gaze.dwell('Spell word')
  gaze.spell('Zephyr', true)
  await gaze.review()
  gaze.dwell('Use word')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a coffee')
  gaze.dwell('Use phrase')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a Zephyr')
  gaze.dwell('Menu')
  gaze.dwell('Undo')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a coffee')
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
  expect(screen.getByRole('button', { name: 'Word 7 George Locked word' })).toBeTruthy()
  gaze.dwell('Previous words')
  expect(screen.getByRole('button', { name: 'Word 1 a Initial' })).toBeTruthy()
  gaze.dwell('Keep entering')
  expect(screen.getByLabelText('Dasher text').textContent).toBe('abcdef{George}')
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('Your message')
}, 30000)
