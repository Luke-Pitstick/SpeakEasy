// @vitest-environment jsdom
import { StrictMode, useLayoutEffect } from 'react'
import { afterEach, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryStore } from '../src/main/memory'
import { CompositionProvider } from '../src/renderer/src/composition/context'
import { useComposition, useCompositionDispatch } from '../src/renderer/src/composition/state'
import { InteractionProvider } from '../src/renderer/src/interaction/controls'
import { MemoryPanel } from '../src/renderer/src/prediction/MemoryPanel'
import { candidateFor } from '../src/shared/predictionValidation'

let state: ReturnType<typeof useComposition>
let dispatch: ReturnType<typeof useCompositionDispatch>
let store: MemoryStore
function Harness(): React.JSX.Element {
  const current = useComposition(),
    send = useCompositionDispatch()
  useLayoutEffect(() => {
    state = current
    dispatch = send
  }, [current, send])
  return <MemoryPanel />
}
afterEach(() => {
  cleanup()
  store?.close()
  delete window.memory
})

it('shows searchable paginated vocabulary and forgets words without opening corrections', async () => {
  store = new MemoryStore(':memory:')
  store.update({ type: 'settings', learning: true, cloud: true })
  for (let i = 0; i < 15; i++)
    store.update({
      type: 'learn',
      id: String(i),
      correction: { before: 'Call Andrew', after: `Call Name${i}` }
    })
  store.update({
    type: 'learn',
    id: 'anjali',
    correction: { before: 'Call Andrew', after: 'Call Anjali' }
  })
  window.memory = {
    read: async () => store.read(),
    update: async (op) => store.update(op),
    onChanged: () => () => {}
  }
  render(
    <CompositionProvider>
      <InteractionProvider>
        <Harness />
      </InteractionProvider>
    </CompositionProvider>
  )
  expect(await screen.findByRole('table', { name: 'Learned vocabulary' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Vocabulary (16)' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Forget this correction' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Forget Anjali' }), { detail: 1 })
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Forget Anjali' })).toBeNull())
  expect(store.read().records).toHaveLength(16)
  expect(store.read().forgottenWords).toEqual(['anjali'])
  fireEvent.change(screen.getByRole('textbox', { name: 'Find a learned word' }), {
    target: { value: 'name14' }
  })
  expect(screen.getByRole('button', { name: 'Forget Name14' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Forget Name0' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Clear word filter' }), { detail: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Next words' }), { detail: 1 })
  expect(screen.getByText('Words 13–15 of 15')).toBeTruthy()
})

it('learns once through the React commit effect, exposes review controls, and retracts on undo', async () => {
  store = new MemoryStore(':memory:')
  const listeners = new Set<() => void>()
  window.memory = {
    read: async () => store.read(),
    update: async (op) => {
      const snapshot = store.update(op)
      listeners.forEach((listener) => listener())
      return snapshot
    },
    onChanged: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
  render(
    <StrictMode>
      <CompositionProvider>
        <InteractionProvider>
          <Harness />
        </InteractionProvider>
      </CompositionProvider>
    </StrictMode>
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Learn my corrections' }), {
    detail: 1
  })
  await waitFor(() => expect(store.read().learning).toBe(true))
  expect(store.read().cloud).toBe(false)
  act(() => dispatch({ type: 'example', initials: 'iwtsa' }))
  act(() => dispatch({ type: 'predict', purpose: 'expansion', id: 'test' }))
  act(() =>
    dispatch({
      type: 'result',
      result: {
        requestId: 'test',
        revision: state.revision,
        purpose: 'expansion',
        provider: 'gemini',
        elapsedMs: 0,
        status: 'success',
        complete: true,
        candidates: [candidateFor(state.request!, 'I want to see Andrew', 0)!]
      }
    })
  )
  act(() => dispatch({ type: 'edit-candidate', id: state.candidates[0].id }))
  act(() => dispatch({ type: 'input', text: 'I want to see Anjali' }))
  expect(store.read().records).toHaveLength(0)
  await act(async () => dispatch({ type: 'use-phrase' }))
  await waitFor(() => expect(store.read().records).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: 'Corrections (1)' }), { detail: 1 })
  expect(screen.getByRole('button', { name: 'Forget this correction' })).toBeTruthy()
  expect(screen.getByText('Learned words: Anjali')).toBeTruthy()
  await act(async () => dispatch({ type: 'undo' }))
  await waitFor(() => expect(store.read().records).toHaveLength(0))
})
