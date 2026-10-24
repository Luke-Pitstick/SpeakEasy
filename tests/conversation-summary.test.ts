import { expect, it, vi } from 'vitest'
import { initialState, reducer } from '../src/renderer/src/composition/model'
import { summarizeConversation } from '../src/main/conversationSummary'
import { summaryRequestSchema } from '../src/shared/conversationSummary'
import { predictionMessages } from '../src/main/gemini'
import { validRequest } from '../src/shared/predictionValidation'

function discussion(): ReturnType<typeof initialState> {
  let state = reducer(initialState(), {
    type: 'conversation-add',
    speaker: 'partner',
    text: 'What deck do you use in Clash Royale?'
  })
  for (let i = 0; i < 8; i++)
    state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: `Follow-up ${i}` })
  return state
}
it('compacts older turns without discarding recent turns, then carries the summary into requests', () => {
  let state = discussion()
  expect(state.conversation).toHaveLength(8)
  expect(state.summaryPending[0].text).toContain('Clash Royale')
  const ids = state.summaryPending.map((t) => t.id)
  const version = state.summaryVersion
  state = reducer(state, { type: 'conversation-add', speaker: 'partner', text: 'Which one?' })
  state = reducer(state, {
    type: 'summary-result',
    version,
    ids,
    summary: 'The partner asked about Clash Royale decks.'
  })
  expect(state.summaryPending).toHaveLength(1)
  state = reducer(state, { type: 'example', initials: 'iphc' })
  state = reducer(state, { type: 'predict', purpose: 'expansion', id: 'summary-test' })
  expect(state.request?.conversationSummary).toContain('Clash Royale')
  expect(validRequest(state.request)).toBe(true)
  expect(JSON.parse(predictionMessages(state.request!)[1].content).conversationSummary).toContain(
    'Clash Royale'
  )
  expect(validRequest({ ...state.request, conversationSummary: 'x'.repeat(2001) })).toBe(false)
})
it('clear and forget earlier context cannot restore late summary results', () => {
  for (const type of ['conversation-clear', 'summary-reset'] as const) {
    const before = discussion()
    let state = reducer(before, { type })
    state = reducer(state, {
      type: 'summary-result',
      version: before.summaryVersion,
      ids: before.summaryPending.map((t) => t.id),
      summary: 'Clash Royale'
    })
    expect(state.conversationSummary).toBe('')
    expect(state.summaryPending).toEqual([])
  }
})
it('validates summary input and provider output and sends earlier context as quoted data', async () => {
  const input = { summary: 'Talking about Clash Royale.', turns: discussion().summaryPending }
  expect(
    summaryRequestSchema.safeParse({ ...input, turns: Array(9).fill(input.turns[0]) }).success
  ).toBe(false)
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ summary: 'Clash Royale deck discussion.' }) }
        }
      ]
    })
  )
  expect(
    await summarizeConversation('key', input, new AbortController().signal, fetcher)
  ).toContain('Clash Royale')
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body))
  expect(JSON.parse(body.messages[1].content)).toEqual(input)
  fetcher.mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: { content: JSON.stringify({ summary: 'x'.repeat(2001) }) }
        }
      ]
    })
  )
  await expect(
    summarizeConversation('key', input, new AbortController().signal, fetcher)
  ).rejects.toThrow()
})
