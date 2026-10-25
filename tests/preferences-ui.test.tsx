// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react'
import { PreferencePanel } from '../src/renderer/src/prediction/PreferencePanel'
import { CompositionProvider } from '../src/renderer/src/composition/context'
import { InteractionProvider } from '../src/renderer/src/interaction/controls'
import { PreferenceStore } from '../src/main/preferenceStore'
import { PreferenceService } from '../src/main/preferenceService'

let store: PreferenceStore
afterEach(() => {
  cleanup()
  store?.close()
  delete window.preferences
})
it('shows automatically learned facts with editable evidence and forgetting controls', async () => {
  store = new PreferenceStore(':memory:')
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    Response.json({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              proposals: [
                {
                  fact: {
                    type: 'preference',
                    subject: 'user',
                    relationship: 'favorite_deck',
                    value: 'Hog Cycle',
                    scope: { game: 'Clash Royale', topic: 'deck' },
                    relatedTerms: ['deck']
                  },
                  quote: 'My favorite deck is Hog Cycle',
                  scopeBasis: 'inferred',
                  scopeExplanation: 'Game inferred from the deck name.'
                }
              ]
            })
          }
        }
      ]
    })
  )
  const callbacks = new Set<(invalidate: boolean, automatic?: boolean) => void>()
  const service = new PreferenceService(
    store,
    'key',
    (invalidate = false, automatic = false) =>
      callbacks.forEach((callback) => callback(invalidate, automatic)),
    () => true,
    fetcher
  )
  await service.update({
    type: 'commit',
    id: 'source',
    text: 'My favorite deck is Hog Cycle',
    conversation: []
  })
  await vi.waitFor(() => expect(service.read().facts).toHaveLength(1))
  window.preferences = {
    read: async () => service.read(),
    update: (op) => service.update(op),
    onChanged: (listener) => {
      callbacks.add(listener)
      return () => {
        callbacks.delete(listener)
      }
    }
  }
  render(
    <CompositionProvider>
      <InteractionProvider>
        <PreferencePanel />
      </InteractionProvider>
    </CompositionProvider>
  )
  expect(await screen.findByText(/Context association: inferred/)).toBeTruthy()
  expect(store.facts()).toHaveLength(1)
  expect(screen.queryByRole('button', { name: 'Approve preference' })).toBeNull()
  fireEvent.change(screen.getByRole('textbox', { name: 'Game' }), { target: { value: '' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Value' }), {
    target: { value: 'Log Bait' }
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save fact changes' }), { detail: 1 })
  await waitFor(() => expect(store.facts()[0].fact.value).toBe('Log Bait'))
  expect(store.facts()[0].fact.scope.game).toBeNull()
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Forget this fact' }) as HTMLButtonElement).disabled
    ).toBe(false)
  )
  fireEvent.click(screen.getByRole('button', { name: 'Forget this fact' }), { detail: 1 })
  await waitFor(() => expect(store.facts()).toEqual([]))
  expect(store.sentences()).toHaveLength(1)
})
