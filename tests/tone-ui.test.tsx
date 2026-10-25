// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { initialState } from '../src/renderer/src/composition/model'
import { StateContext } from '../src/renderer/src/composition/state'
import { InteractionContext } from '../src/renderer/src/interaction/state'
import { useTone } from '../src/renderer/src/features/voice/useTone'
import type { EmotionProposal, ToneRequest } from '../src/shared/tone'

let composition = initialState()
let busy = false
let resolve: (proposal: EmotionProposal) => void
let reject: (error: Error) => void
const suggest = vi.fn<(request: ToneRequest) => Promise<EmotionProposal>>()
function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <StateContext.Provider value={composition}>
      <InteractionContext.Provider
        value={{
          busy,
          setBusy: vi.fn(),
          dwell: true,
          setDwell: vi.fn(),
          duration: 1000,
          setDuration: vi.fn()
        }}
      >
        {children}
      </InteractionContext.Provider>
    </StateContext.Provider>
  )
}
beforeEach(() => {
  vi.useFakeTimers()
  composition = {
    ...initialState(),
    workspace: 'phrases',
    mode: 'literal',
    draft: 'That is wonderful news!',
    revision: 3
  }
  busy = false
  suggest.mockReset().mockImplementation(
    () =>
      new Promise((yes, no) => {
        resolve = yes
        reject = no
      })
  )
  window.tone = {
    status: vi.fn().mockResolvedValue({ configured: true, enabled: true }),
    setEnabled: vi.fn(async (enabled) => ({ configured: true, enabled })),
    suggest,
    cancel: vi.fn()
  }
})
afterEach(() => {
  cleanup()
  delete window.tone
  vi.useRealTimers()
})
async function begin(): Promise<
  ReturnType<typeof renderHook<ReturnType<typeof useTone>, unknown>>
> {
  const view = renderHook(() => useTone('neutral', false), { wrapper })
  await act(async () => {})
  await act(async () => vi.advanceTimersByTime(300))
  return view
}
function proposal(tone: EmotionProposal['tone'] = 'happy'): EmotionProposal {
  const request = suggest.mock.calls.at(-1)![0]
  return {
    requestId: request.id,
    revision: request.revision,
    contextEpoch: request.contextEpoch,
    tone,
    confidence: 0.9,
    model: 'jev-test'
  }
}
it('makes no request without independent cloud-decision permission', async () => {
  vi.mocked(window.tone!.status).mockResolvedValue({ configured: true, enabled: false })
  const view = await begin()
  expect(suggest).not.toHaveBeenCalled()
  expect(view.result.current.value).toBe('neutral')
})
it('defers a suggestion during dwell, then exposes it without changing the draft', async () => {
  const view = await begin()
  busy = true
  view.rerender()
  await act(async () => resolve(proposal()))
  expect(view.result.current.value).toBe('neutral')
  busy = false
  view.rerender()
  await act(async () => vi.advanceTimersByTime(0))
  expect(view.result.current.value).toBe('happy')
  expect(composition.draft).toBe('That is wonderful news!')
})
it('defers an error message until dwell ends so nearby targets stay stable', async () => {
  const view = await begin()
  busy = true
  view.rerender()
  await act(async () => reject(Error('offline')))
  expect(view.result.current.message).toBe('Choosing tone…')
  busy = false
  view.rerender()
  await act(async () => vi.advanceTimersByTime(0))
  expect(view.result.current.message).toContain('Jev unavailable')
})
it('keeps a manual choice even when a late result arrives or context changes', async () => {
  const view = await begin()
  const oldResolve = resolve,
    old = proposal()
  act(() => view.result.current.select('calm'))
  await act(async () => oldResolve(old))
  expect(view.result.current.value).toBe('calm')
  expect(window.tone!.cancel).toHaveBeenCalledWith(old.requestId)
  composition = { ...composition, contextEpoch: 1, conversation: [] }
  view.rerender()
  await act(async () => vi.advanceTimersByTime(500))
  expect(suggest).toHaveBeenCalledOnce()
  expect(view.result.current.value).toBe('calm')
})
it.each(['edit', 'clear context', 'disable', 'resume'] as const)(
  'drops a late result after %s',
  async (change) => {
    const view = await begin()
    const oldResolve = resolve,
      old = proposal()
    if (change === 'edit') composition = { ...composition, revision: 4, draft: 'I am sorry.' }
    if (change === 'clear context')
      composition = { ...composition, contextEpoch: 1, conversation: [] }
    if (change === 'resume') composition = { ...composition, paused: false }
    if (change === 'disable') act(() => view.result.current.setEnabled(false))
    view.rerender()
    await act(async () => oldResolve(old))
    expect(view.result.current.value).toBe('neutral')
    expect(window.tone!.cancel).toHaveBeenCalledWith(old.requestId)
  }
)
it('ignores mismatched results and preserves manual composition on provider failure', async () => {
  const view = await begin()
  await act(async () => resolve({ ...proposal(), revision: 0 }))
  await act(async () => vi.advanceTimersByTime(0))
  expect(view.result.current.value).toBe('neutral')
  expect(view.result.current.message).toContain('Invalid Jev')
  composition = { ...composition, revision: 4, draft: 'I can still write.' }
  view.rerender()
  await act(async () => vi.advanceTimersByTime(300))
  await act(async () => reject(Error('offline')))
  await act(async () => vi.advanceTimersByTime(0))
  expect(view.result.current.message).toContain('Jev unavailable')
  expect(composition.draft).toBe('I can still write.')
})
