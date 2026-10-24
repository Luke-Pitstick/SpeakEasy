// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ActionButton, InteractionProvider } from '../src/renderer/src/interaction/controls'
import { useInteraction } from '../src/renderer/src/interaction/state'
import App from '../src/renderer/src/App'
import { CompositionProvider } from '../src/renderer/src/composition/context'
import { useComposition, useCompositionDispatch } from '../src/renderer/src/composition/state'
import { usePredictions } from '../src/renderer/src/prediction/usePredictions'
import { DemoPhrasePredictor, validateResult } from '../src/renderer/src/prediction/demo'
import type { PredictionRequest, PredictionResult } from '../src/shared/prediction'
import { PointerOverlay } from '../src/renderer/src/features/dasher/PointerOverlay'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  vi.stubGlobal('requestAnimationFrame', () => 1)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function DwellButton({
  onAction,
  identity = 'test'
}: {
  onAction: () => void
  identity?: string
}): React.JSX.Element {
  const { setDwell } = useInteraction()
  return (
    <>
      <button onClick={() => setDwell(true)}>Enable dwell</button>
      <ActionButton identity={identity} onAction={onAction}>
        Select
      </ActionButton>
    </>
  )
}

describe('gaze controls', () => {
  it('allows repeated physical clicks without moving away', () => {
    const action = vi.fn()
    render(
      <InteractionProvider>
        <ActionButton identity="delete" onAction={action}>
          Delete
        </ActionButton>
      </InteractionProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(action).toHaveBeenCalledTimes(2)
  })
  it('cancels pending dwell on Escape and requires re-entry', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    render(
      <InteractionProvider>
        <DwellButton onAction={action} />
      </InteractionProvider>
    )
    fireEvent.click(screen.getByText('Enable dwell'))
    fireEvent.pointerEnter(screen.getByText('Select'))
    act(() => vi.advanceTimersByTime(500))
    fireEvent.keyDown(window, { key: 'Escape' })
    act(() => vi.advanceTimersByTime(1000))
    expect(action).not.toHaveBeenCalled()
    fireEvent.pointerLeave(screen.getByText('Select'))
    fireEvent.pointerEnter(screen.getByText('Select'))
    act(() => vi.advanceTimersByTime(1000))
    expect(action).toHaveBeenCalledOnce()
  })
  it('never carries dwell progress into replacement target content', () => {
    vi.useFakeTimers()
    const action = vi.fn()
    const tree = (identity: string): React.JSX.Element => (
      <InteractionProvider>
        <DwellButton identity={identity} onAction={action} />
      </InteractionProvider>
    )
    const view = render(tree('first'))
    fireEvent.click(screen.getByText('Enable dwell'))
    fireEvent.pointerEnter(screen.getByText('Select'))
    act(() => vi.advanceTimersByTime(800))
    view.rerender(tree('second'))
    act(() => vi.advanceTimersByTime(1000))
    expect(action).not.toHaveBeenCalled()
  })
})

it('keeps the initial workspace to one phrase action and four large persistent controls', () => {
  render(<App />)
  expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
    'Expand',
    'Resume',
    'Undo',
    'Delete',
    'More'
  ])
  expect(screen.queryByText('Settings')).toBeNull()
  expect(screen.queryByText('Refine word')).toBeNull()
})

it('expands demo initials and reveals correction only for the selected word', async () => {
  render(<App />)
  fireEvent.change(screen.getByLabelText('Initials'), { target: { value: 'iwac' } })
  fireEvent.click(screen.getByRole('button', { name: 'Expand', exact: true }))
  fireEvent.click(await screen.findByRole('button', { name: 'I want a coffee', exact: true }))
  expect(screen.queryByText('Spell a replacement')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'coffee', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Spell a replacement' }))
  fireEvent.change(screen.getByLabelText('Replace word'), { target: { value: 'Zephyr' } })
  expect(
    (screen.getByRole('button', { name: 'want', exact: true }) as HTMLButtonElement).disabled
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Use word' }))
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a Zephyr')
  fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }))
  expect(screen.getByLabelText('Accepted draft').textContent).toBe('I want a coffee')
})

function PredictionHarness(): React.JSX.Element {
  const state = useComposition()
  const dispatch = useCompositionDispatch()
  const { setBusy } = useInteraction()
  const { request } = usePredictions('normal')
  return (
    <>
      <button
        onClick={() => {
          dispatch({ type: 'example', initials: 'iwac' })
          setBusy(true)
        }}
      >
        Prepare
      </button>
      <button onClick={() => request('expansion')}>Request</button>
      <button onClick={() => setBusy(false)}>Release dwell</button>
      <output>
        {state.status}:{state.candidates.map((candidate) => candidate.text).join('|')}
      </output>
    </>
  )
}

it('does not let a late canceled response replace the current result staged behind dwell', async () => {
  const responses: { request: PredictionRequest; resolve: (result: PredictionResult) => void }[] =
    []
  const prediction = vi.spyOn(DemoPhrasePredictor.prototype, 'predict').mockImplementation(
    (request) =>
      new Promise((resolve) => {
        responses.push({ request, resolve })
      })
  )
  try {
    render(
      <CompositionProvider>
        <InteractionProvider>
          <PredictionHarness />
        </InteractionProvider>
      </CompositionProvider>
    )
    fireEvent.click(screen.getByText('Prepare'))
    fireEvent.click(screen.getByText('Request'))
    fireEvent.click(screen.getByText('Request'))
    const [old, current] = responses
    const result = (request: PredictionRequest, replacement: string): PredictionResult =>
      validateResult(request, {
        requestId: request.id,
        revision: request.revision,
        purpose: request.purpose,
        provider: 'demo',
        status: 'success',
        candidates: [{ replacement }]
      })
    await act(async () => current.resolve(result(current.request, 'I want a cookie')))
    await act(async () => old.resolve(result(old.request, 'I want a coffee')))
    fireEvent.click(screen.getByText('Release dwell'))
    expect(screen.getByRole('status').textContent).toBe('ready:I want a cookie')
  } finally {
    prediction.mockRestore()
  }
})

it('draws the pointer and center displacement independently of the letter viewport', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const overlay = new PointerOverlay(svg)
  overlay.resize(2000, 600)
  overlay.update({ x: 300, y: -400 }, true)
  expect(svg.getAttribute('viewBox')).toBe('-1000 -300 2000 600')
  expect(svg.querySelector('line')?.getAttribute('x2')).toBe('300')
  expect(svg.querySelector('line')?.getAttribute('y2')).toBe('-400')
  expect(svg.querySelector('circle')?.getAttribute('cx')).toBe('300')
  expect(svg.querySelector('text')?.textContent).toBe('500 px from center')
  overlay.hide()
  expect(svg.querySelector('g')?.getAttribute('visibility')).toBe('hidden')
  overlay.dispose()
  expect(svg.childElementCount).toBe(0)
})
