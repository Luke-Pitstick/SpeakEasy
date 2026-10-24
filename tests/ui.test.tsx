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
import { SvgRenderer } from '../src/renderer/src/features/dasher/SvgRenderer'
import { Geometry } from '../src/renderer/src/features/dasher/geometry'
import { DasherEngine } from '../src/renderer/src/features/dasher/engine'

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
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }), { detail: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }), { detail: 1 })
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

it('keeps bottom controls hidden and toggles Dasher with a click or keyboard', () => {
  render(<App />)
  expect(screen.queryByRole('contentinfo')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Undo', exact: true })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Delete', exact: true })).toBeNull()
  expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy()
  expect(screen.queryByText('Settings')).toBeNull()
  expect(screen.queryByText('Refine word')).toBeNull()
  const surface = screen.getByRole('button', { name: 'Resume Dasher' })
  fireEvent.click(surface)
  expect(screen.getByRole('button', { name: 'Pause Dasher' }).getAttribute('aria-pressed')).toBe(
    'true'
  )
  fireEvent.click(surface)
  expect(screen.getByRole('button', { name: 'Resume Dasher' }).getAttribute('aria-pressed')).toBe(
    'false'
  )
  fireEvent.keyDown(surface, { key: ' ' })
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByRole('button', { name: 'Resume Dasher' })).toBeTruthy()
})

it('starts from a click on a box, pauses on empty space, and resumes without another pointer event', () => {
  const frames: FrameRequestCallback[] = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback)
    return frames.length
  })
  vi.stubGlobal('PointerEvent', MouseEvent)
  const bounds = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 1280,
    bottom: 600,
    width: 1280,
    height: 600,
    toJSON: () => ({})
  })
  render(<App />)
  const surface = screen.getByTestId('dasher-surface')
  const svg = surface.querySelector('svg')!
  const initial = svg.innerHTML
  fireEvent.click(svg.querySelector('rect')!, { clientX: 1000, clientY: 301 })
  const start = performance.now()
  for (let frame = 1; frame <= 60; frame++) act(() => frames.shift()!(start + frame * 16.67))
  const before = svg.innerHTML
  expect(before).not.toBe(initial)
  fireEvent.click(surface, { clientX: 100, clientY: 301 })
  act(() => frames.shift()!(start + 61 * 16.67))
  expect(svg.innerHTML).toBe(before)
  fireEvent.click(svg, { clientX: 1000, clientY: 301 })
  expect(svg.innerHTML).toBe(before)
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  act(() => frames.shift()!(start + 62 * 16.67))
  expect(svg.innerHTML).not.toBe(before)
  bounds.mockRestore()
})

it('paints every starting initial in alphabetical order at short and full panel heights', () => {
  for (const height of [188, 282, 600, 1200]) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const renderer = new SvgRenderer(svg)
    const engine = new DasherEngine(1280, height)
    // Descendants may already be large enough to paint on a tall display;
    // verify the complete first alphabet independently of those nested labels.
    renderer.draw(
      engine.regions().filter((region) => region.depth === 1),
      engine.geometry
    )
    const labels = [...svg.querySelectorAll('text')]
    expect(labels.map((label) => label.textContent).join('')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(labels.every((label) => label.getAttribute('visibility') === 'visible')).toBe(true)
    const rectangles = [...svg.querySelectorAll('rect')]
    expect(rectangles).toHaveLength(26)
    expect(new Set(rectangles.map((rect) => rect.getAttribute('height'))).size).toBeGreaterThan(1)
    renderer.dispose()
  }
})

it('draws an unlabeled starting parent behind its alphabet and zooms them together', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const renderer = new SvgRenderer(svg)
  const engine = new DasherEngine(1280, 600)
  renderer.draw(engine.regions(), engine.geometry)
  const parent = svg.querySelector('.dasher-root rect')!
  expect(svg.firstElementChild!.firstElementChild).toBe(parent.parentElement)
  expect(svg.querySelectorAll('text:empty')).toHaveLength(0)
  expect(engine.text).toBe('')
  const before = Number(parent.getAttribute('height'))
  for (const region of engine.regions().filter((region) => region.depth === 1)) {
    expect(region.left).toBeGreaterThan(engine.root.left)
    expect(region.top).toBeGreaterThanOrEqual(engine.root.top)
    expect(region.top + region.height).toBeLessThanOrEqual(
      engine.root.top + engine.root.height + 0.001
    )
  }
  engine.resume()
  engine.setSample(100, 0)
  engine.step(16)
  renderer.draw(engine.regions(), engine.geometry)
  expect(svg.querySelector('.dasher-root rect')).toBe(parent)
  expect(Number(parent.getAttribute('height'))).toBeGreaterThan(before)
  expect(engine.text).toBe('')
  renderer.dispose()
})

it('keeps nested labels above rectangles and box colors stable when depth changes', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const renderer = new SvgRenderer(svg)
  const geometry = new Geometry(1280, 600)
  const region = { id: 1, label: 'a', text: 'a', left: -100, top: -100, height: 200, depth: 2 }
  renderer.draw([region], geometry)
  const color = svg.querySelector('[data-region="a"]')!.getAttribute('class')
  renderer.draw([{ ...region, depth: 0 }], geometry)
  expect(svg.querySelector('[data-region="a"]')!.getAttribute('class')).toBe(color)
  expect(svg.lastElementChild!.querySelector('text')!.textContent).toBe('a')
  expect(svg.firstElementChild!.querySelector('rect')).toBeTruthy()
  renderer.dispose()
  expect(svg.childElementCount).toBe(0)
})

it('culls small continuation boxes until they grow, without a fixed layer limit', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const renderer = new SvgRenderer(svg)
  const geometry = new Geometry(1280, 600)
  const parent = { id: 1, label: 'a', text: 'a', left: -100, top: -100, height: 200, depth: 0 }
  const child = { id: 2, label: 'b', text: 'ab', left: 100, top: -50, height: 40, depth: 1 }
  const preview = { id: 3, label: 'c', text: 'abc', left: 400, top: -40, height: 8, depth: 2 }
  renderer.draw([parent, child, preview], geometry)
  expect(svg.querySelectorAll('rect')).toHaveLength(2)
  expect(svg.querySelectorAll('text')).toHaveLength(2)
  expect(svg.querySelector('[data-region="c"]')).toBeNull()

  // A deeper layer is revealed by screen size, not merely by being instantiated.
  renderer.draw([parent, child, { ...preview, height: 10 }], geometry)
  expect(svg.querySelectorAll('rect')).toHaveLength(3)
  expect(svg.querySelector('[data-region="c"]')).toBeTruthy()
  renderer.draw([parent, child, { ...preview, height: 9.9 }], geometry)
  expect(svg.querySelector('[data-region="c"]')).toBeNull()
  expect([...svg.querySelectorAll('text')].map((label) => label.textContent)).toEqual(['a', 'b'])
  renderer.dispose()
})

it('fits boxes on resize and resumes once after an intentional layout change', () => {
  let notifyResize = (): void => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notifyResize = callback
      }
      observe = vi.fn()
      disconnect = vi.fn()
    }
  )
  let height = 600
  const bounds = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1280,
      bottom: height,
      width: 1280,
      height,
      toJSON: () => ({})
    }))
  render(<App />)
  const surface = screen.getByTestId('dasher-surface')
  fireEvent.click(surface)
  height = 700
  act(() => notifyResize())
  expect(screen.getByRole('button', { name: 'Resume Dasher' })).toBeTruthy()
  expect(surface.querySelector('svg')!.getAttribute('viewBox')).toBe('-640 -350 1280 700')
  height = 800
  fireEvent.click(surface)
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  expect(surface.querySelector('svg')!.getAttribute('viewBox')).toBe('-640 -400 1280 800')
  act(() => notifyResize())
  expect(screen.getByRole('button', { name: 'Pause Dasher' })).toBeTruthy()
  bounds.mockRestore()
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
