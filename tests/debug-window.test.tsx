// SPDX-FileCopyrightText: 2026 SpeakEasy contributors
// SPDX-License-Identifier: GPL-3.0-only
// See LICENSE for the full terms, including the warranty disclaimer.

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
  const close = vi.fn().mockResolvedValue(undefined)
  window.diagnostics = {
    open: vi.fn(),
    context: vi.fn(),
    clear,
    close,
    read: vi.fn().mockResolvedValue({
      enabled: true,
      context: {
        epoch: 0,
        revision: 2,
        draft: '',
        initials: 'ittitc',
        lockedMessage: '',
        conversation: [{ speaker: 'me', text: "I didn't like math." }],
        retainedTurnCount: 12,
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
      ],
      transcripts: [{ at: 3, session: 's', id: 's-1', text: 'Did you like school?' }],
      generations: [
        {
          requestId: 'school',
          at: 4,
          acronym: 'i d l m',
          model: 'google/gemini-3.8-flash',
          status: 'complete',
          cached: [],
          shortTerm: {
            conversation: [{ speaker: 'partner', text: 'What did you dislike?' }],
            lockedMessage: '',
            draft: ''
          },
          longTerm: {
            query: 'school subjects',
            cacheHit: false,
            facts: [
              {
                type: 'preference',
                subject: 'user',
                relationship: 'dislikes',
                value: 'math',
                scope: { game: null, topic: 'school' },
                relatedTerms: []
              }
            ],
            vocabulary: ['algebra'],
            examples: []
          },
          reasoning: {
            context: {
              topic: 'school',
              timeFrame: 'past',
              replyIntent: 'name a disliked subject',
              vocabulary: [],
              certain: true
            },
            model: 'They want a disliked subject.'
          },
          candidates: ["I didn't like math"]
        }
      ]
    })
  }
  render(<DebugWindow />)
  await screen.findByText("I didn't like math.", { exact: false })
  expect(screen.getByText('What is wrong with math', { exact: false })).toBeTruthy()
  expect(screen.getByText('Retained session turns: 12/500')).toBeTruthy()
  expect(screen.getByText('{"initials":"idlm"}')).toBeTruthy()
  expect(screen.getByText('Did you like school?', { exact: false })).toBeTruthy()
  expect(screen.getByText('i d l m')).toBeTruthy()
  expect(screen.getByText('What did you dislike?')).toBeTruthy()
  expect(screen.getByText('school subjects')).toBeTruthy()
  expect(screen.getByText('algebra')).toBeTruthy()
  expect(screen.getByText('They want a disliked subject.')).toBeTruthy()
  expect(screen.getByText("I didn't like math")).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'retrieval' } })
  expect(screen.queryByText('{"initials":"idlm"}')).toBeNull()
  expect(screen.getByText('{"query":"math subjects","selected":[]}')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Clear debug history' }))
  await waitFor(() => expect(clear).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByRole('button', { name: '← Back to SpeakEasy' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2))
})
