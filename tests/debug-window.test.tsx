// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DebugWindow } from '../src/renderer/src/prediction/DebugWindow'

afterEach(() => {
  cleanup()
  delete window.diagnostics
})
it('shows active context and inspectable prior requests, filters history, and clears it', async () => {
  const clear = vi.fn().mockResolvedValue(undefined)
  window.diagnostics = {
    open: vi.fn(),
    context: vi.fn(),
    clear,
    read: vi.fn().mockResolvedValue({
      enabled: true,
      context: {
        epoch: 0,
        revision: 2,
        draft: '',
        initials: 'ittitc',
        lockedMessage: '',
        conversation: [{ speaker: 'me', text: "I didn't like math." }],
        summary: 'School subjects',
        pendingSummary: [],
        partial: 'What is wrong with math',
        queuedTranscripts: [],
        listening: 'Listening',
        paused: true,
        busy: false
      },
      events: [
        { sequence: 1, at: 1, kind: 'request', requestId: 'school', data: '{"initials":"idlm"}' },
        {
          sequence: 2,
          at: 2,
          kind: 'retrieval',
          requestId: 'math',
          data: '{"query":"math subjects","selected":[]}'
        }
      ]
    })
  }
  render(<DebugWindow />)
  await screen.findByText("I didn't like math.", { exact: false })
  expect(screen.getByText('What is wrong with math', { exact: false })).toBeTruthy()
  expect(screen.getByText('School subjects')).toBeTruthy()
  expect(screen.getByText('{"initials":"idlm"}')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'retrieval' } })
  expect(screen.queryByText('{"initials":"idlm"}')).toBeNull()
  expect(screen.getByText('{"query":"math subjects","selected":[]}')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear debug history' }))
  await waitFor(() => expect(clear).toHaveBeenCalledOnce())
})
